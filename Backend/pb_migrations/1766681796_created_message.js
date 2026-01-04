/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": "@request.auth.id != \"\" && sender.id = @request.auth.id && conversation.participants.id ?= @request.auth.id",
    "deleteRule": null,
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_728114816",
        "hidden": false,
        "id": "relation2324571881",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "conversation",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "relation"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_2472191607",
        "hidden": false,
        "id": "relation1593854671",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "sender",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "relation"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text4274335913",
        "max": 0,
        "min": 0,
        "name": "content",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text2363381545",
        "max": 0,
        "min": 0,
        "name": "type",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
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
      },
      {
        "hidden": false,
        "id": "bool2555855207",
        "name": "read",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "bool"
      },
      {
        "hidden": false,
        "id": "autodate2990389176",
        "name": "created",
        "onCreate": true,
        "onUpdate": false,
        "presentable": false,
        "system": false,
        "type": "autodate"
      },
      {
        "hidden": false,
        "id": "autodate3332085495",
        "name": "updated",
        "onCreate": true,
        "onUpdate": true,
        "presentable": false,
        "system": false,
        "type": "autodate"
      }
    ],
    "id": "pbc_669929365",
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && conversation.participants.id ?= @request.auth.id",
    "name": "message",
    "system": false,
    "type": "base",
    "updateRule": "conversation.participants.id ?= @request.auth.id",
    "viewRule": "@request.auth.id != \"\" && conversation.participants.id ?= @request.auth.id"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_669929365");

  return app.delete(collection);
})
