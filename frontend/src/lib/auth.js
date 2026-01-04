import pb from '$lib/pocketbase';
import { goto } from '$app/navigation';

export function requireAuth(){
    if(!pb.authStore.isValid){
        goto('/');
    }
}