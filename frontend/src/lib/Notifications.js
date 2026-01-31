import pb from '$lib/pocketbase';

/**
 * Create a notification
 * @param {Object} params - Notification parameters
 */
export async function createNotification({
  userId,
  triggeredById,
  type,
  message,
  postId = null
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