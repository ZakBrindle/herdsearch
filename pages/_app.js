// pages/_app.js
import '../styles/globals.css';
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