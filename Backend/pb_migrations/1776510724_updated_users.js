/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // add field
  collection.fields.addAt(24, new Field({
    "hidden": false,
    "id": "number3462790106",
    "max": null,
    "min": null,
    "name": "locationLng",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(25, new Field({
    "hidden": false,
    "id": "number3443762891",
    "max": null,
    "min": null,
    "name": "locationLat",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(26, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text1890728348",
    "max": 0,
    "min": 0,
    "name": "locationAddress",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // remove field
  collection.fields.removeById("number3462790106")

  // remove field
  collection.fields.removeById("number3443762891")

  // remove field
  collection.fields.removeById("text1890728348")

  return app.save(collection)
})
