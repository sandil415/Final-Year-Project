/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_842702175")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id = user",
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_842702175")

  // update collection data
  unmarshal({
    "createRule": " @request.auth.id != \"\"",
    "listRule": null,
    "viewRule": null
  }, collection)

  return app.save(collection)
})
