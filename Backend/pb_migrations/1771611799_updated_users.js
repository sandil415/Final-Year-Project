/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // add field
  collection.fields.addAt(19, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text755628466",
    "max": 0,
    "min": 0,
    "name": "businessName",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
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

  // add field
  collection.fields.addAt(21, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text2284899023",
    "max": 0,
    "min": 0,
    "name": "businessPhone",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(22, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text1616969316",
    "max": 0,
    "min": 0,
    "name": "businessAddress",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(23, new Field({
    "hidden": false,
    "id": "bool2487745274",
    "name": "isVerified",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2472191607")

  // remove field
  collection.fields.removeById("text755628466")

  // remove field
  collection.fields.removeById("select4294234269")

  // remove field
  collection.fields.removeById("text2284899023")

  // remove field
  collection.fields.removeById("text1616969316")

  // remove field
  collection.fields.removeById("bool2487745274")

  return app.save(collection)
})
