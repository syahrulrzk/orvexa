import { getContext } from 'svelte';
export function useLocale(){const get=getContext<()=>string>('locale');return {t:(id:string,en:string)=>get()==='en'?en:id,get};}
