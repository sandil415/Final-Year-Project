<script>
  // Sample story data - replace with your actual data
  const stories = [
    { id: 1, username: 'user1', avatar: '', hasStory: true, viewed: false },
    { id: 2, username: 'user2', avatar: '', hasStory: true, viewed: false },
    { id: 3, username: 'user3', avatar: '', hasStory: true, viewed: true },
    { id: 4, username: 'user4', avatar: '', hasStory: true, viewed: false },
    { id: 5, username: 'user5', avatar: '', hasStory: true, viewed: true },
  ];

  function handleStoryClick(story) {
    console.log('Story clicked:', story);
    // TODO: Open story viewer
  }
</script>

<div class="stories-container flex gap-5 overflow-x-auto pb-2 scrollbar-hide">
  {#each stories as story (story.id)}
    <button
      on:click={() => handleStoryClick(story)}
      class="flex-shrink-0 flex flex-col items-center gap-1 group"
    >
      <!-- Story Circle with Gradient Ring -->
      <div class="relative">
        <!-- Gradient ring for unviewed stories -->
        <div 
          class="w-14 h-14 rounded-full p-[2px] transition-transform group-hover:scale-105
                 {story.viewed 
                   ? 'bg-gray-300' 
                   : 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600'}"
        >
          <!-- White padding -->
          <div class="w-full h-full rounded-full p-[2px] bg-white">
            <!-- Avatar/Placeholder -->
            <div class="w-full h-full rounded-full bg-gradient-to-br from-gray-200 to-gray-300 
                        flex items-center justify-center overflow-hidden">
              {#if story.avatar}
                <img src={story.avatar} alt={story.username} class="w-full h-full object-cover" />
              {:else}
                <span class="text-gray-600 text-xs font-medium">
                  {story.username.charAt(0).toUpperCase()}
                </span>
              {/if}
            </div>
          </div>
        </div>
        
        <!-- Optional: Add icon for live or new content -->
        {#if !story.viewed}
          <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 rounded-full 
                      border-2 border-white flex items-center justify-center">
            <span class="text-white text-[8px] font-bold">+</span>
          </div>
        {/if}
      </div>
      
      <!-- Username (optional) -->
      <!-- <span class="text-xs text-gray-600 max-w-[56px] truncate">
        {story.username}
      </span> -->
    </button>
  {/each}
</div>

<style>
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>