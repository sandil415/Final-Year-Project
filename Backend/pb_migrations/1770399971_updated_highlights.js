/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3301151734")

  // add field
  collection.fields.addAt(1, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_2472191607",
    "hidden": false,
    "id": "relation2375276105",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "user",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text724990059",
    "max": 0,
    "min": 0,
    "name": "title",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "file1829049001",
    "maxSelect": 1,
    "maxSize": 0,
    "mimeTypes": [],
    "name": "coverImage",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": [],
    "type": "file"
  }))

  // add field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "number4113142680",
    "max": null,
    "min": null,
    "name": "order",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3301151734")

  // remove field
  collection.fields.removeById("relation2375276105")

  // remove field
  collection.fields.removeById("text724990059")

  // remove field
  collection.fields.removeById("file1829049001")

  // remove field
  collection.fields.removeById("number4113142680")

  return app.save(collection)
})
