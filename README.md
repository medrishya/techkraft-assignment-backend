## To run the project via docker

- Make a file named .env.postgres with following details

```
POSTGRES_USER=merchant_admin
POSTGRES_PASSWORD=change_this_admin_password
POSTGRES_DB=merchant_risk

APP_DB_USER=merchant_app
APP_DB_PASSWORD=change_this_app_password
```

-- Make a file named .env.docker with following details

```
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_USERNAME=merchant_app
DATABASE_PASSWORD=change_this_app_password
DATABASE_NAME=merchant_risk

REDIS_HOST=redis
REDIS_PORT=6379

# Application
PORT=3000

# Replace with a secure local development secret
JWT_SECRET=replace_with_a_long_random_development_secret

```

Run `docker-compose up -d --build`

## Project setup

```bash
$ npm install
```

- Run migration files `npm run migrate:run`
- To seed entries `npm run seed:users`

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Before runing integration tests

- Make sure you have an .env.test file with following details

```
NODE_ENV=test

DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=techkraftinctest
DATABASE_PASSWORD=techkraftinctest
DATABASE_NAME=techkraftinctest

JWT_SECRET=replace_with_a_long_random_development_secret
```

- Make sure you have these database settings in your postgres

## Run tests

- For integration test run migration `migration:test:run`

```bash
# unit tests
$ npm run test:unit

# e2e tests
$ npm run test:integration

# test coverage
$ npm run test:cov
```
