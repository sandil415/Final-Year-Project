
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/auth" | "/auth/login" | "/auth/signup" | "/auth/verify" | "/auth/verify/[token]" | "/home" | "/messages" | "/messages/[conversationId]" | "/profile" | "/profile/edit" | "/profile/[username]" | "/search";
		RouteParams(): {
			"/auth/verify/[token]": { token: string };
			"/messages/[conversationId]": { conversationId: string };
			"/profile/[username]": { username: string }
		};
		LayoutParams(): {
			"/": { token?: string; conversationId?: string; username?: string };
			"/auth": { token?: string };
			"/auth/login": Record<string, never>;
			"/auth/signup": Record<string, never>;
			"/auth/verify": { token?: string };
			"/auth/verify/[token]": { token: string };
			"/home": Record<string, never>;
			"/messages": { conversationId?: string };
			"/messages/[conversationId]": { conversationId: string };
			"/profile": { username?: string };
			"/profile/edit": Record<string, never>;
			"/profile/[username]": { username: string };
			"/search": Record<string, never>
		};
		Pathname(): "/" | "/auth" | "/auth/" | "/auth/login" | "/auth/login/" | "/auth/signup" | "/auth/signup/" | "/auth/verify" | "/auth/verify/" | `/auth/verify/${string}` & {} | `/auth/verify/${string}/` & {} | "/home" | "/home/" | "/messages" | "/messages/" | `/messages/${string}` & {} | `/messages/${string}/` & {} | "/profile" | "/profile/" | "/profile/edit" | "/profile/edit/" | `/profile/${string}` & {} | `/profile/${string}/` & {} | "/search" | "/search/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/.DS_Store" | "/images/.DS_Store" | "/images/Advertisement.jpg" | "/images/Curry.jpg" | "/images/HealthyRecipe.jpg" | "/images/Influencer.jpg" | "/images/Login.jpg" | "/images/Signup.jpg" | "/images/Stalls.jpg" | "/images/profilePlaceholder.jpg" | "/robots.txt" | string & {};
	}
}