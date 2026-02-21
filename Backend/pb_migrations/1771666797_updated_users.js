/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // update field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "select1466534506",
    "maxSelect": 1,
    "name": "accountType",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "select",
    "values": [
      "personal",
      "business"
    ]
  }))

  // update field
  collection.fields.addAt(20, new Field({
    "hidden": false,
    "id": "select4294234269",
    "maxSelect": 1,
    "name": "businessType",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "home_chef",
      "restaurant",
      "catering"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // update field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "select1466534506",
    "maxSelect": 1,
    "name": "role",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "select",
    "values": [
      "user",
      "cook",
      "admin"
    ]
  }))

  // update field
  collection.fields.addAt(20, new Field({
    "hidden": false,
    "id": "select4294234269",
    "maxSelect": 1,
    "name": "businessType",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "home_chef",
      "restaurant"
    ]
  }))

  return app.save(collection)
})
