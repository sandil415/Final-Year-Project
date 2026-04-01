/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // remove field
  collection.fields.removeById("file2873592500")

  // remove field
  collection.fields.removeById("file1495991956")

  // remove field
  collection.fields.removeById("file3847590462")

  // remove field
  collection.fields.removeById("file234278459")

  // remove field
  collection.fields.removeById("text1827300844")

  // remove field
  collection.fields.removeById("select2063623452")

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // add field
  collection.fields.addAt(24, new Field({
    "hidden": false,
    "id": "file2873592500",
    "maxSelect": 1,
    "maxSize": 0,
    "mimeTypes": [],
    "name": "dftqcLicense",
    "presentable": false,
    "protected": false,
    "required": true,
    "system": false,
    "thumbs": [],
    "type": "file"
  }))

  // add field
  collection.fields.addAt(25, new Field({
    "hidden": false,
    "id": "file1495991956",
    "maxSelect": 1,
    "maxSize": 0,
    "mimeTypes": [],
    "name": "regCertificate",
    "presentable": false,
    "protected": false,
    "required": true,
    "system": false,
    "thumbs": [],
    "type": "file"
  }))

  // add field
  collection.fields.addAt(26, new Field({
    "hidden": false,
    "id": "file3847590462",
    "maxSelect": 1,
    "maxSize": 0,
    "mimeTypes": [],
    "name": "panCertificate",
    "presentable": false,
    "protected": false,
    "required": true,
    "system": false,
    "thumbs": [],
    "type": "file"
  }))

  // add field
  collection.fields.addAt(27, new Field({
    "hidden": false,
    "id": "file234278459",
    "maxSelect": 1,
    "maxSize": 0,
    "mimeTypes": [],
    "name": "wardLicense",
    "presentable": false,
    "protected": false,
    "required": true,
    "system": false,
    "thumbs": [],
    "type": "file"
  }))

  // add field
  collection.fields.addAt(28, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text1827300844",
    "max": 0,
    "min": 0,
    "name": "rejectionReason",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(29, new Field({
    "hidden": false,
    "id": "select2063623452",
    "maxSelect": 1,
    "name": "status",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "pending",
      "approved",
      "rejected"
    ]
  }))

  return app.save(collection)
})
