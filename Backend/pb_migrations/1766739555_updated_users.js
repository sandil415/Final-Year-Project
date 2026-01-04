/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // add field
  collection.fields.addAt(13, new Field({
    "hidden": false,
    "id": "number3430500629",
    "max": null,
    "min": null,
    "name": "followingCount",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(14, new Field({
    "hidden": false,
    "id": "number2741838532",
    "max": null,
    "min": null,
    "name": "postsCount",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(15, new Field({
    "hidden": false,
    "id": "bool2325058159",
    "name": "suspended",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  // add field
  collection.fields.addAt(16, new Field({
    "hidden": false,
    "id": "date2020919790",
    "max": "",
    "min": "",
    "name": "suspendedUntil",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // add field
  collection.fields.addAt(17, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text139250437",
    "max": 0,
    "min": 0,
    "name": "suspendedReason",
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
  collection.fields.removeById("number3430500629")

  // remove field
  collection.fields.removeById("number2741838532")

  // remove field
  collection.fields.removeById("bool2325058159")

  // remove field
  collection.fields.removeById("date2020919790")

  // remove field
  collection.fields.removeById("text139250437")

  return app.save(collection)
})
