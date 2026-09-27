import { error } from '@sveltejs/kit';
const sections=['dashboard','rooms','projects','tasks','approvals','agents','divisions','virtual-office','company','knowledge','activity','providers','usage','settings'];
export const load=({params})=>{if(!sections.includes(params.section))error(404,'Page not found');return {section:params.section};};
