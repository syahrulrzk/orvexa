<script lang="ts">
 import '../app.css';import {setContext} from 'svelte';
 let {data,children}=$props();setContext('locale',()=>data.locale);
 $effect(()=>{document.documentElement.lang=data.locale;});
</script>
<svelte:head><title>ORVEXA — Your AI Workforce</title><meta name="description" content="Tim karyawan AI untuk membantu bisnis Anda. Your AI team, built around your business."/></svelte:head>
{@render children()}
