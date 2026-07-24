const core = require("@actions/core");
require("fs").promises;
const {
  ECSClient,
  ListTasksCommand,
  ExecuteCommandCommand,
} = require("@aws-sdk/client-ecs");
const WebSocket = require("ws");
const { ssm } = require("ssm-session");
const util = require("util");

(async () => {
  try {
    // inputs defined in action.yml
    const region = core.getInput('region')
    const cluster = core.getInput('cluster_name')
    const serviceName = core.getInput('service_name')
    const container = core.getInput('container_name') // optional; required for multi-container tasks
    const command = core.getInput('command')

    const ecs = new ECSClient({ region });

    console.log(
      `Getting tasks running in the ${serviceName} service within the ${cluster} cluster`
    );
    const listTasks = new ListTasksCommand({
      cluster,
      serviceName,
      desiredStatus: "RUNNING",
    });
    const { taskArns } = await ecs.send(listTasks);
    console.log("Retrieved the following taskArns: ", taskArns);

    if (!taskArns || taskArns.length === 0) {
      throw new Error(
        `No RUNNING tasks found in service '${serviceName}' within cluster '${cluster}'.`
      );
    }

    console.log("Extracting taskId from first taskArn...");
    const task = taskArns[0];
    console.log("Extracted taskId: ", task);

    // ECS Exec streams terminal output but does NOT return the remote command's
    // exit status. Wrap the command in a shell that echoes a unique marker with
    // the exit code so we can detect failure from the streamed output below.
    const EXIT_MARKER = "__ECS_EXEC_EXIT__";
    const escapedCommand = command.replace(/'/g, `'\\''`);
    const wrappedCommand = `/bin/sh -c '${escapedCommand}; echo ${EXIT_MARKER}=$?'`;

    console.log(
      `Running command "${command}"${container ? ` in container "${container}"` : ""}....`
    );
    const executeCommand = new ExecuteCommandCommand({
      cluster,
      interactive: true,
      command: wrappedCommand,
      task,
      ...(container ? { container } : {}),
    });
    console.log('Sending execution command..');
    const response = await ecs.send(executeCommand);
    console.log('response received!: ', response.session);
    const { streamUrl, tokenValue } = response.session;

    const textDecoder = new util.TextDecoder();
    const textEncoder = new util.TextEncoder();

    const termOptions = {
      rows: 34,
      cols: 197,
    };
    
    console.log('intiating connection with response....')
    const connection = new WebSocket(streamUrl);

    process.stdin.on("keypress", (str, key) => {
      if (connection.readyState === connection.OPEN) {
        ssm.sendText(connection, textEncoder.encode(str));
      }
    });

    // Accumulate the streamed terminal output so we can scan it for the exit
    // marker once the session closes.
    let output = "";

    await new Promise((resolve, reject) => {
      connection.onopen = () => {
        ssm.init(connection, {
          token: tokenValue,
          termOptions: termOptions,
        });
      };

      connection.onerror = (error) => {
        reject(
          new Error(
            `WebSocket error: ${error && error.message ? error.message : error}`
          )
        );
      };

      connection.onmessage = (event) => {
        var agentMessage = ssm.decode(event.data);
        ssm.sendACK(connection, agentMessage);
        if (agentMessage.payloadType === 1) {
          const text = textDecoder.decode(agentMessage.payload);
          output += text;
          process.stdout.write(text);
        } else if (agentMessage.payloadType === 17) {
          ssm.sendInitMessage(connection, termOptions);
        }
      };

      connection.onclose = () => {
        resolve();
      };
    });

    // The command line itself is echoed back by the interactive PTY (with a
    // literal "=$?"), so match only a marker followed by digits and take the
    // last occurrence — that is the real command's exit code.
    const matches = [...output.matchAll(new RegExp(`${EXIT_MARKER}=(\\d+)`, "g"))];
    const exitCode = matches.length ? matches[matches.length - 1][1] : null;

    if (exitCode === null) {
      core.setFailed(
        "Command did not report an exit code — the exec session may have dropped before the command finished."
      );
    } else if (exitCode !== "0") {
      core.setFailed(`Command "${command}" exited with code ${exitCode}.`);
    } else {
      console.log("Execution complete");
    }
  } catch (err) {
    core.setFailed(err.message);
  }
})();
