// pages/_app.js

// This line is essential for loading all your Tailwind styles.
import '../styles/globals.css';

// You can also include your custom Head component here
import CustomHead from '../components/Head';

function MyApp({ Component, pageProps }) {
  return (
    <>
      <CustomHead />
      <Component {...pageProps} />
    </>
  );
}

export default MyApp;