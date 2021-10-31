import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler'

import { fetchSiteAssetFromKvAsHtmlPage, addStandardResponseHeaders } from '@my-liminal-space/cw-site-assets';
import { validateCognitoJwt } from '@my-liminal-space/cw-validate-cognito-jwt';


const AUTH_TOKEN_EXPECTED_TYPE = "Bearer";
//const COGNITO_REDIRECT_HTTP_CODE = 307;
const COOKIE_NAME_JWT = "AUTH8JWT";
const COOKIE_NAME_ORIGINAL_PATH = "Original-Request-Path";
const COOKIE_NAME_COGNITO_LOGIN_URL = "Cognito-Login-URL";
const COGNITO_RETURN_PAGE_PATH = "/login/cognito-return.html";


/*
  Workers Site entry point.
*/
addEventListener('fetch', event => {

  try {
    
    if ("GET" === event.request.method) {
      const reqGetResponse = handleGetEvent(event);
      event.respondWith(reqGetResponse);
    } else if ("POST" === event.request.method) {
      event.respondWith(handlePostEvent(event));
    } else {
      return event.respondWith(
        new Response("Unrecognised HTTP method, expecting GET or POST, received: " + event.request.method, {
          status: 500,
        }),
      )
    }

  } catch (e) {
    
    console.log("addEventListener - in catch... exception is: " + e.toString());

    return event.respondWith(
      new Response(e.message || e.toString(), {
        status: 500,
      }),
    );

  }
});


async function handlePostEvent(event) {
  console.log("handling post...");
  let postAuthResponse = null;

  try {

    const formData = await event.request.formData();
    let authToken = formData.get("authToken");
    let authTokenType = formData.get("authTokenType");
    console.log("Token:\n" + authToken + "\n\nType: " + authTokenType);

    if (AUTH_TOKEN_EXPECTED_TYPE === authTokenType.trim()) {

      //var jwtValid = await isValidCognitoJwt(authToken);
      var jwtValid = await validateCognitoJwt(COGNITO_ENDPOINT_URL, COGNITO_LOGIN_CLIENT_ID
        , MLS_COGNITO, authToken);

      if (jwtValid) {
        console.log("all is well with JWT, serve originally requested page...");
        postAuthResponse = await redirectToOriginalAuthenticatedPage(event, authToken);
      } else {
        console.log("JWT is invalid, go back to Cognito...");
        // @ToDo - Go to Cognito, make sure not to loose original requested page (if its set)!
      }

    } else {
        // @ToDo - wrong kind of token try Cognito again (same as failed validation case above)
    }

  } catch (err) {
    console.log("problem handling post: " + err);
  }

  return postAuthResponse;
}


async function handleGetEvent(event) {
  const url = new URL(event.request.url);
  console.log("handling GET for: " + event.request.url);

  try {

    /*
      Is this request under /req-auth8 ?
      If so there needs to be a valid authentication token in request cookie, redirect to Cognito
      to get one if its missing.
    */
    if (url.pathname.startsWith("/req-auth8")) {
      console.log("Request for page requiring authentication: " + url.pathname);

      // look for jwt cookie
      let jwtStr = getCookie(event.request, COOKIE_NAME_JWT);
      if (jwtStr && jwtStr.trim().length) {
        console.log("JWT is: " + jwtStr);
        
        //var jwtOk = await isValidCognitoJwt(jwtStr);
        var jwtOk = await validateCognitoJwt(COGNITO_ENDPOINT_URL, COGNITO_LOGIN_CLIENT_ID
          , MLS_COGNITO, jwtStr);
        
        console.log("jwtOk is: " + jwtOk);

        if (!jwtOk) {
          // redirect to cognito for authentication
          console.log("JWT check failed, redirecting to Cognito");
          return await redirectToCognitoWithOriginalReqPath(event, url.pathname);
        }
        // all is well, drop through to send page...
        console.log("JWT check completed ok, dropping through to requested page...");
      } else { 
        // no authentication, redirect to cognito
        console.log("No JWT in request and not on redirect return page, redirect to Cognito");
        return await redirectToCognitoWithOriginalReqPath(event, url.pathname);
      }
    }

    console.log("in GET path, gone past auth token check...");

    return await fetchStandardAssetAsResponse(event);

  } catch (e3) {

    console.log("problem in handleGetEvent try: " + e3);
    
    const errPage = await fetchSiteAssetFromKvAsHtmlPage("error/500.html");
    let resp = new Response(errPage.body, { ...errPage, status: 500 });
    return resp;

  }
}


async function fetchStandardAssetAsResponse(event) {

  const url = new URL(event.request.url);

  try {

    const page = await getAssetFromKV(event, {});

    let response = new Response(page.body, page);
    response = addStandardResponseHeaders(response);
    
    if (url.pathname.endsWith(".html") || url.pathname === "/" || url.pathname.length === 0) {
      response.headers.set('Cache-Control', 'no-store');
    } else {
      response.headers.set('Cache-Control', 'public, max-age=1209600');
    }

    //console.log("fetchStandardAssetAsResponse - about to return ok for: " + url.pathname);
    return response;

  } catch (fetchContentErr) {

    console.log("fetchStandardAssetAsResponse - problem fetching: " + url.pathname + ", e: " + fetchContentErr.toString());

    // see if the page exists
    try {

      const siteAssetPath2KvKey = JSON.parse(__STATIC_CONTENT_MANIFEST);
      const pageKey = siteAssetPath2KvKey[url.pathname];
      console.log("fetchStandardAssetAsResponse - problem fetching: " + url.pathname + ", page key is: " + pageKey);

      if (!pageKey) {
        const nfPage = await fetchSiteAssetFromKvAsHtmlPage("error/404.html");
        let resp = new Response(nfPage.body, { ...nfPage, status: 404 });
        return resp;
      }

    } catch (noPathForAssetInSiteKv) {
      console.log("fetchStandardAssetAsResponse - problem fetching: " + url.pathname + ", noPathForAssetInSiteKv: " 
        + noPathForAssetInSiteKv.toString());
    }

  }

  console.log("fetchStandardAssetAsResponse - problem fetching: " + url.pathname + ", dropped through to send 500");
  const errPage = await fetchSiteAssetFromKvAsHtmlPage("error/500.html");
  let resp = new Response(errPage.body, { ...errPage, status: 500 });
  return resp;
}


function getCookie(request, name) {
  let result = '';
  const cookieString = request.headers.get('Cookie');
  if (cookieString) {
    const cookies = cookieString.split(';');
    cookies.forEach(cookie => {
      const cookieName = cookie.split('=')[0].trim();
      if (cookieName === name) {
        const cookieVal = cookie.split('=')[1];
        result = cookieVal;
      }
    })
  }
  return result;
}


async function redirectToCognitoWithOriginalReqPath(event, originalRequestPath) {

  console.log("into redirectToCognitoWithOriginalReqPath, original request path: " + originalRequestPath);

  let cognitoResponse = await fetchSiteAssetFromKvAsHtmlPage("login/do-cognito-redirect.html");

  // need target url cookie, cognito endpoint url header
  let DOMAIN_NAME_APP = "";
  if (SUBDOMAIN_NAME.length > 0) {
    DOMAIN_NAME_APP = SUBDOMAIN_NAME + "." + DOMAIN_NAME_ROOT;
  } else {
    DOMAIN_NAME_APP = DOMAIN_NAME_ROOT;
  }


  console.log(`redirectToCognitoWithOriginalReqPath - cognito return domain name: ${DOMAIN_NAME_APP}`);
  

  const COGNITO_LOGIN_URL = "https://" + COGNITO_LOGIN_HOSTNAME
    + "/login?client_id=" + COGNITO_LOGIN_CLIENT_ID
    + "&response_type=token&scope=aws.cognito.signin.user.admin+email+openid+profile&redirect_uri=https://"
    + DOMAIN_NAME_APP + COGNITO_RETURN_PAGE_PATH;

  appendBrowserReadableResponseCookie(cognitoResponse, COOKIE_NAME_COGNITO_LOGIN_URL, COGNITO_LOGIN_URL);
  appendBrowserReadableResponseCookie(cognitoResponse, COOKIE_NAME_ORIGINAL_PATH, originalRequestPath);

  console.log("About to return from redirectToCognitoWithOriginalReqPath...");
  return cognitoResponse;
}


async function redirectToOriginalAuthenticatedPage(event, authJwt) {
  console.log("into redirectToOriginalAuthenticatedPage...");

  let redirectResponse = await fetchSiteAssetFromKvAsHtmlPage("login/do-req-page-redirect.html");

  setResponseCookie(redirectResponse, COOKIE_NAME_JWT, authJwt);
  appendBrowserReadableResponseCookie(redirectResponse, COOKIE_NAME_ORIGINAL_PATH, getCookie(event.request
    , COOKIE_NAME_ORIGINAL_PATH));

  console.log("About to return from redirectToOriginalAuthenticatedPage...");
  return redirectResponse;
}


function setResponseCookie(httpResponse, cookieName, cookieValue) {
  let stdCookieOpts = "; Domain=" + DOMAIN_NAME_ROOT + "; Secure; SameSite=Lax; path=/;";
  httpResponse.headers.set('Set-Cookie', cookieName + "=" + cookieValue + "" + stdCookieOpts);
}


function appendBrowserReadableResponseCookie(httpResponse, cookieName, cookieValue) {
  let stdCookieOpts = "; Domain=" + DOMAIN_NAME_ROOT + "; Secure; SameSite=Lax; path=/";
  httpResponse.headers.append('Set-Cookie', cookieName + "=" + cookieValue + "" + stdCookieOpts);
}