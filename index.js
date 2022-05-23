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
    const command = core.getInput('command')

    const ecs = new ECSClient({ region });

    console.log(
      `Getting tasks running in the ${serviceName} service within the ${cluster} cluster`
    );
    const listTasks = new ListTasksCommand({ cluster, serviceName });
    const { taskArns } = await ecs.send(listTasks);
    console.log("Retrieved the following taskArns: ", taskArns);

    console.log("Extracting taskId from first taskArn...");
    const task = taskArns[0];
    console.log("Extracted taskId: ", task);

    console.log(`Running command ${command}....`);
    const executeCommand = new ExecuteCommandCommand({
      cluster,
      interactive: true,
      command,
      task,
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

    connection.onopen = () => {
      ssm.init(connection, {
        token: tokenValue,
        termOptions: termOptions,
      });
    };

    connection.onerror = (error) => {
      console.log(`WebSocket error: ${error}`);
    };

    connection.onmessage = (event) => {
      var agentMessage = ssm.decode(event.data);
      ssm.sendACK(connection, agentMessage);
      if (agentMessage.payloadType === 1) {
        process.stdout.write(textDecoder.decode(agentMessage.payload));
      } else if (agentMessage.payloadType === 17) {
        ssm.sendInitMessage(connection, termOptions);
      }
    };

    connection.onclose = () => {
      console.log("Execution complete");
    };
  } catch (err) {
    core.setFailed(err.message);
  }
})();
