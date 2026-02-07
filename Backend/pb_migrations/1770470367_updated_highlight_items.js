/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3314482660")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && @request.auth.id = user && @request.auth.id = highlight.user",
    "deleteRule": "@request.auth.id != \"\" && @request.auth.id = user && @request.auth.id = highlight.user",
    "listRule": "@request.auth.id != \"\"",
    "updateRule": "@request.auth.id != \"\" && @request.auth.id = user && @request.auth.id = highlight.user",
    "viewRule": "@request.auth.id != \"\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3314482660")

  // update collection data
  unmarshal({
    "createRule": null,
    "deleteRule": null,
    "listRule": null,
    "updateRule": null,
    "viewRule": null
  }, collection)

  return app.save(collection)
})
