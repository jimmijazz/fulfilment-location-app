import "@babel/polyfill";
import dotenv from "dotenv";
import "isomorphic-fetch";
import createShopifyAuth, { verifyRequest } from "@shopify/koa-shopify-auth";
import Shopify, { ApiVersion } from "@shopify/shopify-api";
import Koa from "koa";
import next from "next";
import Router from "koa-router";
const {MongoClient} = require('mongodb');

/* how to import custom functions */
import * as utilities from "./modules/utilities";
import * as db from "./modules/db";

dotenv.config();

const port = parseInt(process.env.PORT, 10) || 8081;
const dev = process.env.NODE_ENV !== "production";
const app = next({
  dev,
});

/* Connect to DB */
const client = new MongoClient(process.env.URI);

const handle = app.getRequestHandler();

Shopify.Context.initialize({
  API_KEY: process.env.SHOPIFY_API_KEY,
  API_SECRET_KEY: process.env.SHOPIFY_API_SECRET,
  SCOPES: process.env.SCOPES.split(","),
  HOST_NAME: process.env.HOST.replace(/https:\/\//, ""),
  API_VERSION: ApiVersion.Unstable,
  IS_EMBEDDED_APP: true,
  // This should be replaced with your preferred storage strategy
  SESSION_STORAGE: new Shopify.Session.MemorySessionStorage(),
});

/* Storing the currently active shops in memory will force them to re-login when your server restarts. You should
// persist this object in your app.

IE TODO: Persists this in a database to know which shops are authed
*/
const ACTIVE_SHOPIFY_SHOPS = {};

const webhooksToRegister = [
  {
  path : "/webhooks", // Where to send the webhook
  topic : "APP_UNINSTALLED", // What the webhook topic is
  webhookHandler : appUninstalledWebhookHandler // What to do when we get a webhook
  },
  {
    path : "/webhooks",
    topic : "ORDERS_CREATE",
    webhookHandler : orderCreateWebhookHandler
  },
  {
    path : "/webhooks",
    topic : "PRODUCTS_CREATE",
    webhookHandler : productsCreateWebhookHandler
  }
];


async function main() {
  try {
     await client.connect();
     // db.listDatabases(client);
     console.log("Database connected");
     // Quick way to reload webhook handlers on server restart (https://github.com/Shopify/shopify-node-api/issues/157)
     // Update webhooks for the store
     utilities.asyncForEach(webhooksToRegister, async (webhook) => {
       const response = await Shopify.Webhooks.Registry.webhookRegistry.push({
         path: webhook.path,
         topic: webhook.topic,
         webhookHandler: webhook.webhookHandler
       });
     });

  } catch(e) {
    console.error(e);
  };

};

main().catch(console.error);

// Webhook Functions
async function orderCreateWebhookHandler(topic, shop, body) {
  // Handle order creation
  // const { shop, accessToken, scope } = ctx.state.shopify;
  // console.log(topic);
  console.log("Order Created")
};

async function appUninstalledWebhookHandler(topic, shop, body) {
  // Remove the shop
  // const { shop, accessToken, scope } = ctx.state.shopify;
  console.log("App Uninstalled");
  delete ACTIVE_SHOPIFY_SHOPS[shop];
};

async function productsCreateWebhookHandler(topic, shop, body) {
  // Handle new products being created
  console.log(topic, shop, body);
  console.log("PRODUCT CREATED \n");

  // Retrieve token
  var shopData = await db.retrieveShop(client, shop);
  console.log(shopData);
  var token = shopData["token"]
  // const session = await Shopify.Utils.loadCurrentSession(req, res); // Load the current session to get the `accessToken`
  // console.log(session)
  // const client = new Shopify.Clients.Graphql(session.shop, session.accessToken);   // GraphQLClient takes in the shop url and the accessToken for that shop.
  // // Use client.query and pass your query as `data`
  // const products = await client.query({
  //   data: `{
  //       products (first: 10) {
  //         edges {
  //           node {
  //             id
  //             title
  //             descriptionHtml
  //           }
  //         }
  //       }
  //     }`,
  // });
  // console.log(products);
}


app.prepare().then(async () => {
  const server = new Koa();
  const router = new Router();
  server.keys = [Shopify.Context.API_SECRET_KEY];

  server.use(
    createShopifyAuth({
      async afterAuth(ctx) {
        // Access token and shop available in ctx.state.shopify
        const { shop, accessToken, scope } = ctx.state.shopify;
        const host = ctx.query.host;
        ACTIVE_SHOPIFY_SHOPS[shop] = scope;

        db.updateToken(client, shop, accessToken, scope);

        // Update webhooks for the store
        utilities.asyncForEach(webhooksToRegister, async (webhook) => {
          const response = await Shopify.Webhooks.Registry.register({
            shop,
            accessToken,
            path: webhook.path,
            topic: webhook.topic,
            webhookHandler: webhook.webhookHandler
          });

          if (!response.success) {
            console.log(
              `Failed to register ${webhook.path} webhook: ${response.result}`
            );
          } else {
            console.log(
              `Successfully registered ${webhook.path} webhook`
            );
          }
        });

        // Redirect to app with shop parameter upon auth
        ctx.redirect(`/?shop=${shop}&host=${host}`);
      },
    })
  );

  const handleRequest = async (ctx) => {
    await handle(ctx.req, ctx.res);
    ctx.respond = false;
    ctx.res.statusCode = 200;
  };

  router.post("/webhooks", async (ctx) => {
    try {
      // console.log("ctx: ", ctx)
      await Shopify.Webhooks.Registry.process(ctx.req, ctx.res);
      console.log(`Webhook processed, returned status code 200`);
    } catch (error) {
      console.log(`Failed to process webhook: ${error}`);
    }
  });

  router.post(
    "/graphql",
    verifyRequest({ returnHeader: true }),
    async (ctx, next) => {
      await Shopify.Utils.graphqlProxy(ctx.req, ctx.res);
    }
  );

  router.get("(/_next/static/.*)", handleRequest); // Static content is clear
  router.get("/_next/webpack-hmr", handleRequest); // Webpack content is clear
  router.get("(.*)", async (ctx) => {
    const shop = ctx.query.shop;

    // This shop hasn't been seen yet, go through OAuth to create a session
    if (ACTIVE_SHOPIFY_SHOPS[shop] === undefined) {
      ctx.redirect(`/auth?shop=${shop}`);
    } else {
      await handleRequest(ctx);
    }
  });

  server.use(router.allowedMethods());
  server.use(router.routes());
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });

});
