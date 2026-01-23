// /// <reference path="../pb_data/types.d.ts" />

// onModelAfterCreate((e) => {
//   // Only process messages collection
//   if (e.collection.name !== 'messages') return;

//   const message = e.model;
  
//   try {
//     // Fetch the conversation
//     const conversation = $app.dao().findRecordById('conversations', message.get('conversation'));
    
//     const participants = conversation.get('participants');
    
//     for (let i = 0; i < participants.length; i++) {
//       const userId = participants[i];
      
//       // Skip sender
//       if (userId === message.get('sender')) continue;
      
//       // Skip users actively viewing the conversation
//       const user = $app.dao().findRecordById('users', userId);
//       if (user.get('activeConversation') === message.get('conversation')) continue;
      
//       // Prevent multiple notifications for rapid messages
//       let existing = null;
//       try {
//         existing = $app.dao().findFirstRecordByFilter(
//           'notifications',
//           `receiver="${userId}" && type="message" && read=false && link="${message.get('conversation')}"`
//         );
//       } catch (e) {
//         // No existing notification found, continue
//       }
      
//       if (existing) continue;
      
//       // Build notification text
//       let body = 'New message';
//       const content = message.get('content');
//       const media = message.get('media');
      
//       if (content && content.trim().length > 0) {
//         body = content.length > 80 ? content.slice(0, 77) + '...' : content;
//       } else if (media && media.length > 0) {
//         body = 'Image';
//       }
      
//       // Create the notification
//       const collection = $app.dao().findCollectionByNameOrId('notifications');
//       const record = new Record(collection);
      
//       record.set('receiver', userId);
//       record.set('type', 'message');
//       record.set('title', 'New message');
//       record.set('body', body);
//       record.set('link', message.get('conversation'));
//       record.set('read', false);
      
//       $app.dao().saveRecord(record);
//     }
//   } catch (error) {
//     console.error('Error in message notification hook:', error);
//   }
// }, 'messages');