# AWS ECS Exec with Nodejs

This executes a given command in the specified ECS Fargate Service. It assumes that all tasks within a service are the same, and it doesn't matter which task the command runs on. We use it to perform database migrations.

## Inputs

## `region`

**Required** Region the ECS cluster is in.

## `cluster_name`

**Required** ECS cluster the target container is a part of.

## `service_name`

**Required**ECS Service the target container is a part of.

## `container_name`

**Optional** Name of the container within the task to run the command in. Required when the task runs more than one container (ECS errors with "For tasks containing multiple containers, you must specify a container name."); if omitted, ECS defaults to the task's only container.

## `command`

**Required** Command to run within the targeted service.

## Outputs


## Failure detection

ECS Exec streams terminal output but does not return the remote command's exit
status. To detect failures, the action wraps the command in a shell that echoes
a sentinel with the exit code (`... ; echo __ECS_EXEC_EXIT__=$?`) and scans the
streamed output for it. The step **fails** if the command exits non-zero, or if
the exec session closes before the sentinel is seen (e.g. a dropped connection).

## Example usage

```
uses: risk3sixty/ecs-exec@v2.1
with:
	region: 'us-east-1'
	cluster_name: 'my-cluster'
	service_name: 'my-service'
	container_name: 'my-container' # optional; required for multi-container tasks
	command: 'npm run migrate'
