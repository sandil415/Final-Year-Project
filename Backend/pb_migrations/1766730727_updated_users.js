/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // add field
  collection.fields.addAt(11, new Field({
    "hidden": false,
    "id": "date3590278340",
    "max": "",
    "min": "",
    "name": "usernameLastChanged",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // remove field
  collection.fields.removeById("date3590278340")

  return app.save(collection)
})
