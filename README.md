# Hello world javascript action

This executes a given command in the specified ECS Fargate Service. It assumes that all tasks within a service are the same, and it doesn't matter which task the command runs on. We use it to perform database migrations.

## Inputs

## `region`

**Required** Region the ECS cluster is in.

## `cluster_name`

**Required** ECS cluster the target container is a part of.

## `service_name`

**Required**ECS Service the target container is a part of.

## `command`

**Required** Command to run within the targeted service.

## Outputs


## Example usage

uses: actions/hello-world-javascript-action@v1.1
with:
  region: 'us-east-1'
  cluster_name: 'my-cluster'
  service_name: 'my-service'
  command: 'npm run migrate'