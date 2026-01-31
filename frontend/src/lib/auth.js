// import pb from '$lib/pocketbase';
// import { goto } from '$app/navigation';

// export function requireAuth(){
//     if(!pb.authStore.isValid){
//         goto('/');
//     }
// }

import pb from '$lib/pocketbase';
import { goto } from '$app/navigation';

export function requireAuth() {
  // Check if user is authenticated
  if (!pb.authStore.isValid || !pb.authStore.model) {
    // Only redirect if not already on login page
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      goto('/login');
    }
    return false;
  }
  return true;
}

export function getUser() {
  return pb.authStore.model;
}

export function isAuthenticated() {
  return pb.authStore.isValid && pb.authStore.model !== null;
}