import { writable } from 'svelte/store';

const createStoriesStore = () => {
  const { subscribe, set, update } = writable([]);

  return {
    subscribe,
    setStories: (stories) => set(stories),
    markAsViewed: (storyId) => update(stories => 
      stories.map(s => s.id === storyId ? { ...s, viewed: true } : s)
    ),
    addStory: (story) => update(stories => [story, ...stories]),
    removeStory: (storyId) => update(stories => 
      stories.filter(s => s.id !== storyId)
    ),
  };
};

export const storiesStore = createStoriesStore();