/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1129176978")

  // update collection data
  unmarshal({
    "name": "likes"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1129176978")

  // update collection data
  unmarshal({
    "name": "Likes"
  }, collection)

  return app.save(collection)
})
