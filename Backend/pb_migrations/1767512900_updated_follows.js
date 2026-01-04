/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660641689")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\"",
    "deleteRule": "@request.auth.id = follower\n",
    "listRule": "@request.auth.id = follower\n"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660641689")

  // update collection data
  unmarshal({
    "createRule": null,
    "deleteRule": null,
    "listRule": null
  }, collection)

  return app.save(collection)
})
