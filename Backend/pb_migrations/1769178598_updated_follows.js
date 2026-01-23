/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660641689")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && @request.auth.id = follower.id && follower.id != following.id",
    "deleteRule": "@request.auth.id = follower.id\n",
    "listRule": "@request.auth.id != \"\"\n",
    "updateRule": "@request.auth.id = follower.id",
    "viewRule": "@request.auth.id != \"\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660641689")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\"",
    "deleteRule": "@request.auth.id = follower\n",
    "listRule": "@request.auth.id = follower\n",
    "updateRule": null,
    "viewRule": null
  }, collection)

  return app.save(collection)
})
