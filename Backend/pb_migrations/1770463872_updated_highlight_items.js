/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3314482660")

  // add field
  collection.fields.addAt(1, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_3301151734",
    "hidden": false,
    "id": "relation3382237236",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "highlight",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(2, new Field({
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
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "file1781309708",
    "maxSelect": 1,
    "maxSize": 0,
    "mimeTypes": [],
    "name": "media",
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
  const collection = app.findCollectionByNameOrId("pbc_3314482660")

  // remove field
  collection.fields.removeById("relation3382237236")

  // remove field
  collection.fields.removeById("relation2375276105")

  // remove field
  collection.fields.removeById("file1781309708")

  // remove field
  collection.fields.removeById("number4113142680")

  return app.save(collection)
})
