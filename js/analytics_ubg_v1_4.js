// Keep only this GA Measurement ID.
const GA_MEASUREMENT_ID = "G-2GN799J5LW";

function loadGoogleAnalytics(id) {
    const firstScript = document.getElementsByTagName("script")[0];
    const newScript = document.createElement("script");
    newScript.async = "";
    newScript.src = "https://www.googletagmanager.com/gtag/js?id=" + id;
    firstScript.parentNode.insertBefore(newScript, firstScript);

    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag("js", new Date());
    gtag("config", id);
}

window.addEventListener("load", function() {
    loadGoogleAnalytics(GA_MEASUREMENT_ID);
});
