<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { beforeNavigate, afterNavigate, onNavigate } from '$app/navigation';

	let { children } = $props();

	 beforeNavigate(() => {
        document.documentElement.style.cursor = "progress";
        document.body.style.cursor = "progress";
    });

    onNavigate((navigation) => {
        if (!document.startViewTransition) return;
        return new Promise((resolve) => {
            document.startViewTransition(async () => {
                resolve();
                await navigation.complete;
            });
        });
    });

    afterNavigate(() => {
        document.documentElement.style.cursor = "";
        document.body.style.cursor = "";
    });
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>


{@render children()}


<style>
    @view-transition {
        navigation: auto;
    }
    ::view-transition-group(navbar-transition) {
        animation: none;
    }
    ::view-transition-old(root) {
        animation: 0.6s cubic-bezier(0.4, 0, 0.2, 1) both blur-out;
    }
    ::view-transition-new(root) {
        animation: 0.6s cubic-bezier(0.4, 0, 0.2, 1) both blur-in;
    }
    @keyframes blur-out {
        to {
            filter: blur(20px);
            opacity: 0;
        }
    }
    @keyframes blur-in {
        from {
            filter: blur(20px);
            opacity: 0;
        }
    }

   ::view-transition-group(hero-img) {
    animation-duration: 1s;
    animation-timing-function: cubic-bezier(0.85, 0, 0.15, 1);
}
</style>
