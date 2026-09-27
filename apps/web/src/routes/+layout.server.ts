export const load=({cookies,locals}:import('./$types').LayoutServerLoadEvent)=>({locale:cookies.get('locale')==='en'?'en':'id',user:locals.user??null});
