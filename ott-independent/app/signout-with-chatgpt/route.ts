export function GET(request:Request){return Response.redirect(new URL('/logout',request.url),303);}
