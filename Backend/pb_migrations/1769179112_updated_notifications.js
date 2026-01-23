/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2301922722")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\"\n",
    "deleteRule": "@request.auth.id = user.id",
    "listRule": "@request.auth.id = user.id",
    "updateRule": "@request.auth.id = user.id",
    "viewRule": "@request.auth.id = user.id"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2301922722")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.role = \"admin\"\n",
    "deleteRule": null,
    "listRule": null,
    "updateRule": null,
    "viewRule": "@request.auth.id = user"
  }, collection)

  return app.save(collection)
})
