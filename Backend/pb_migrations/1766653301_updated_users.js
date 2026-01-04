/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // update field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "bool256245529",
    "name": "verified",
    "presentable": true,
    "required": false,
    "system": true,
    "type": "bool"
  }))

  // update field
  collection.fields.addAt(9, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3709889147",
    "max": 0,
    "min": 0,
    "name": "bio",
    "pattern": "",
    "presentable": true,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // update field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "bool256245529",
    "name": "verified",
    "presentable": false,
    "required": false,
    "system": true,
    "type": "bool"
  }))

  // update field
  collection.fields.addAt(9, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3709889147",
    "max": 0,
    "min": 0,
    "name": "bio",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
})
