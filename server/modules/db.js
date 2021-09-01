/* Database functions */
var utilities = require("./utilities")
export const listDatabases = async function (client){
    let databasesList = await client.db().admin().listDatabases();
    console.log("Databases:");
    databasesList.databases.forEach(db => console.log(` - ${db.name}`));
};

export const updateToken = async function(client, shop, rawAccessToken, scope) {
  /* Updates the token in our database. Note - not encrypted */

  var data = {
    _id : shop,
    token : utilities.encrypt(rawAccessToken),
    scopes : scope
  };

  client.db("PRODUCTION").collection("STORES").updateOne(
    {_id : shop},
    { $set : data},
    {upsert : true});

};

export const retrieveShop = async function(client, shop) {
  return client.db("PRODUCTION").collection("STORES").findOne({
    _id : shop
  })
}
