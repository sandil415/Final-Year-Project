/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
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

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // remove field
  collection.fields.removeById("file2873592500")

  return app.save(collection)
})
