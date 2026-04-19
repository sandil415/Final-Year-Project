/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3516833924")

  // add field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "select1702914297",
    "maxSelect": 5,
    "name": "mealType",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "Breakfast",
      "Lunch",
      "Dinner",
      "Snack",
      "Drink"
    ]
  }))

  // add field
  collection.fields.addAt(10, new Field({
    "hidden": false,
    "id": "select274994863",
    "maxSelect": 1,
    "name": "cuisineType",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "Nepali",
      "Indian",
      "Continental",
      "Chinese",
      "Other"
    ]
  }))

  // add field
  collection.fields.addAt(11, new Field({
    "hidden": false,
    "id": "select1986955251",
    "maxSelect": 1,
    "name": "dietType",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "Veg",
      "Vegan",
      "Non-Veg"
    ]
  }))

  // add field
  collection.fields.addAt(12, new Field({
    "hidden": false,
    "id": "select2628463297",
    "maxSelect": 1,
    "name": "priceTier",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "Budget",
      "Standard",
      "Premium"
    ]
  }))

  // add field
  collection.fields.addAt(13, new Field({
    "hidden": false,
    "id": "select3198022195",
    "maxSelect": 1,
    "name": "spiceLevel",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "Mild",
      "Medium"
    ]
  }))

  // add field
  collection.fields.addAt(14, new Field({
    "hidden": false,
    "id": "select4245397551",
    "maxSelect": 1,
    "name": "healthTag",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "Healthy",
      "Regular",
      "Fried"
    ]
  }))

  // add field
  collection.fields.addAt(15, new Field({
    "hidden": false,
    "id": "select771627325",
    "maxSelect": 1,
    "name": "popularityTag",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "None",
      "BestSeller",
      "Trending",
      "Chef Special"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3516833924")

  // remove field
  collection.fields.removeById("select1702914297")

  // remove field
  collection.fields.removeById("select274994863")

  // remove field
  collection.fields.removeById("select1986955251")

  // remove field
  collection.fields.removeById("select2628463297")

  // remove field
  collection.fields.removeById("select3198022195")

  // remove field
  collection.fields.removeById("select4245397551")

  // remove field
  collection.fields.removeById("select771627325")

  return app.save(collection)
})
