<script lang="ts">
import { Globe } from 'lucide-svelte';import {useLocale} from '$lib/i18n';import {post} from '$lib/api';import {invalidateAll} from '$app/navigation';const {get}=useLocale();let pending=$state(false);
async function change(){pending=true;try{await post('locale',{locale:get()==='id'?'en':'id'});await invalidateAll();}finally{pending=false;}}
</script>
<button class="language" onclick={change} disabled={pending} aria-label="Switch language / Ganti bahasa"><Globe size={16}/>{get()==='id'?'ID':'EN'}<span class="language-alt">/ {get()==='id'?'EN':'ID'}</span></button>
