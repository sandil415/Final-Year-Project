/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // update collection data
  unmarshal({
    "updateRule": "@request.auth.id = id"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // update collection data
  unmarshal({
    "updateRule": "@request.auth.id = id\n"
  }, collection)

  return app.save(collection)
})
