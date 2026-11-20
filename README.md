<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Browser notifications

Browser push needs a VAPID key pair and the web push subscriptions migration on each backend environment. Generate a pair once with `npx web-push generate-vapid-keys`, then set `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT` (for example `mailto:admin@example.com`) in the backend environment. Keep the private key secret and keep the same pair across restarts so existing browser subscriptions remain valid. Run the normal migration command (`npm run migration:run` or `npm run migration:run:built`) before starting the updated backend.

Users enable system alerts per browser in Notification settings. The browser requires a secure origin (HTTPS or localhost) and notification permission. When the app has focus, alerts appear in the app; when it is minimized or closed, the service worker displays a system notification. Existing notification preferences still control which alerts are delivered.

## KPI activity records

The normal migration `1797900040000-KpiAchievementActivities` creates the achievement activity and evidence tables. Apply it to an environment before using the Add Activity form; without it, PostgreSQL reports that `phase3_kpi_achievement_activities` does not exist. The migration also handles environments where the earlier development-only activity tables already exist.

## Email safety override

Use the shared recipient-override mechanism to prevent non-production email sends from reaching real users.

Example non-production configuration:

```env
NODE_ENV=development

MAIL_OVERRIDE_ENABLED=true
MAIL_TEST_TO=test@example.com
MAIL_TEST_CC=developer@example.com
MAIL_TEST_BCC=qa@example.com
```

Behavior:

- `local`, `development`, and `uat` never send to original recipients when `MAIL_OVERRIDE_ENABLED=true`.
- Original `to`, `cc`, and `bcc` recipients are replaced with the configured test recipients.
- The original recipients, current environment, and source module are appended to the generated email body for debugging.

## File upload payloads

Document-style uploads now use one shared Base64 payload structure across HR modules:

```json
{
  "fileName": "document.pdf",
  "fileSize": 245678,
  "mimeType": "application/pdf",
  "fileString": "base64-encoded-file-content"
}
```

Current document endpoints expect that payload inside a `file` property:

- `POST /onboarding/requests/:id/documents`
- `POST /offboarding/requests/:id/documents`
- `POST /leave/requests/:id/documents`
- `POST /employees/:id/documents`

The backend validates the file name, file size, MIME type, and Base64 content before saving, and all document/profile-photo files are persisted through the shared `FilesService`.
- Original BCC recipients are never copied into normal email headers.
- If recipient override is enabled in `local`, `development`, or `uat` and `MAIL_TEST_TO` is empty or invalid, delivery is blocked.
- If recipient override is disabled in `local`, `development`, or `uat`, delivery is blocked as an additional safety guard.
- `prod`, `production`, and `live` always send to the original recipients, and `MAIL_OVERRIDE_ENABLED=true` is ignored there.

Supported environment aliases:

- `local`
- `dev`, `development`
- `uat`
- `prod`, `production`, `live`
- `test`

Verification:

```bash
$ npm test -- --runInBand --runTestsByPath src/modules/mail/mail-recipient-safety.util.spec.ts src/modules/mail/mail.service.spec.ts src/modules/hr/notifications/hr-notification.listener.spec.ts
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
