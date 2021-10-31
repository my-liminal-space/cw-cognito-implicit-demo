# Authenticated Access to Cloudflare Sites Assets using AWS Cognito JWTs

## Introduction
This repo is a basic www site that demonstrates the use of:
 - @my-liminal-space/cw-site-assets
 - @my-liminal-space/cw-validate-cognito-jwt

It includes a basic (but functional) integration with the AWS Cognito Login UI.

To see how it works, open the file "workers-site/index.js", the entry point is 
the method "addEventListener".

In addition to the config provided in wrangler.toml, a secret (set using 
wrangler) called COGNITO_LOGIN_CLIENT_ID is required (app ID of Cognito App 
Client).

A deployed instance of the site is [available here](https://cw-cognito-implicit-demo.deaddodgeydigitaldeals.com/index.html).

## Deployment
Currently only a "production" environment is defined, so its just:

    wrangler publish --env production


## Testing

It's all manual...