import pb from '$lib/pocketbase';

/**
 * Create a notification
 * @param {Object} params - Notification parameters
 * @param {string} params.userId - ID of user receiving notification
 * @param {string} params.triggeredById - ID of user who triggered it
 * @param {string} params.type - Type: 'like', 'comment', 'follow', 'message'
 * @param {string} params.message - Notification message
 * @param {string} [params.postId] - Optional post ID
 * @param {string} [params.conversationId] - Optional conversation ID
 */
export async function createNotification({
  userId,
  triggeredById,
  type,
  message,
  postId = null,
  conversationId = null
}) {
  try {
    // Don't create notification if user is notifying themselves
    if (userId === triggeredById) {
      return null;
    }

    const data = {
      user: userId,
      triggeredBy: triggeredById,
      type,
      message,
      read: false
    };

    if (postId) {
      data.post = postId;
    }

    if (conversationId) {
      data.relatedConversation = conversationId;
    }

    const notification = await pb.collection('notifications').create(data);
    return notification;
  } catch (err) {
    console.error('Failed to create notification:', err);
    return null;
  }
}

/**
 * Create a like notification
 */
export async function notifyLike(postOwnerId, likerId, likerUsername, postId) {
  // Don't notify if liking own post
  if (postOwnerId === likerId) {
    return null;
  }

  return createNotification({
    userId: postOwnerId,
    triggeredById: likerId,
    type: 'like',
    message: `${likerUsername} liked your post.`,
    postId
  });
}

/**
 * Create a comment notification
 */
export async function notifyComment(postOwnerId, commenterId, commenterUsername, postId) {
  // Don't notify if commenting on own post
  if (postOwnerId === commenterId) {
    return null;
  }

  return createNotification({
    userId: postOwnerId,
    triggeredById: commenterId,
    type: 'comment',
    message: `${commenterUsername} commented on your post.`,
    postId
  });
}

/**
 * Create a follow notification
 */
export async function notifyFollow(followedUserId, followerId, followerUsername) {
  return createNotification({
    userId: followedUserId,
    triggeredById: followerId,
    type: 'follow',
    message: `${followerUsername} started following you.`
  });
}

/**
 * Create a smart message notification
 * Only notifies if recipient is NOT currently viewing the conversation
 */
export async function notifyMessage(recipientId, senderId, senderUsername, messageContent, conversationId) {
  try {
    // Don't notify yourself
    if (recipientId === senderId) {
      return null;
    }

    // Check if recipient is currently viewing this conversation
    const recipient = await pb.collection('users').getOne(recipientId);
    
    // If they're actively viewing this conversation, DON'T notify
    if (recipient.activeConversation === conversationId) {
      console.log('User is active in conversation, skipping notification');
      return null;
    }

    // They're NOT viewing the conversation, send notification
    return createNotification({
      userId: recipientId,
      triggeredById: senderId,
      type: 'message',
      message: `${senderUsername} sent you a message: "${messageContent.slice(0, 50)}${messageContent.length > 50 ? '...' : ''}"`,
      conversationId
    });
  } catch (err) {
    console.error('Failed to create message notification:', err);
    return null;
  }
}