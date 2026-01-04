/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // add field
  collection.fields.addAt(12, new Field({
    "hidden": false,
    "id": "number2750409325",
    "max": null,
    "min": null,
    "name": "followersCount",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // remove field
  collection.fields.removeById("number2750409325")

  return app.save(collection)
})
