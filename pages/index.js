// pages/index.js
import { useState, useEffect } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc, onSnapshot, collection, addDoc, query, where, getDocs, updateDoc, arrayUnion, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import Map from '../components/Map';
import Modal from '../components/Modal';

// Constants for Firestore paths to keep them consistent
const APP_ID = 'festival-friend-finder';
const getAreasCollection = () => collection(db, `artifacts/${APP_ID}/public/data/areas`);
const getAreaDoc = (id) => doc(db, `artifacts/${APP_ID}/public/data/areas`, id);
const getUserDoc = (uid) => doc(db, `artifacts/${APP_ID}/users/${uid}/profile`, 'data');
const getPublicProfilesCollection = () => collection(db, `artifacts/${APP_ID}/public/data/user_profiles`);

export default function HomePage() {
  // --- STATE MANAGEMENT ---
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [isDevMode, setDevMode] = useState(false);
  const [currentPolygonPoints, setCurrentPolygonPoints] = useState([]);
  const [areas, setAreas] = useState({});
  const [friendsData, setFriendsData] = useState({});

  // Modal visibility states
  const [modal, setModal] = useState({ name: null, data: null }); // e.g., { name: 'settings', data: {} }

  // --- AUTHENTICATION ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        await setupUser(user); // Ensure user profile exists
      } else {
        setCurrentUser(null);
        setUserData(null);
        setFriendsData({});
        // Clean up all states on logout
      }
    });
    return () => unsubscribe();
  }, []);

  const signIn = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(err => alert(`Sign-in error: ${err.message}`));
  const logOut = () => signOut(auth);

  const setupUser = async (user) => {
    const userRef = getUserDoc(user.uid);
    const publicProfileRef = doc(getPublicProfilesCollection(), user.uid);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      const profileData = {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email ? user.email.toLowerCase() : null,
        photoURL: user.photoURL,
      };
      await setDoc(userRef, { ...profileData, friends: [], location: null, currentArea: 'unknown', useGps: true });
      await setDoc(publicProfileRef, profileData);
    }
  };

  // --- DATA SUBSCRIPTIONS (FIRESTORE) ---
  useEffect(() => {
    if (!currentUser) return;

    // Listen to current user's data
    const unsubUser = onSnapshot(getUserDoc(currentUser.uid), (doc) => {
        const data = doc.data();
        setUserData(data);
        setFriendsData(prev => ({ ...prev, [currentUser.uid]: data }));

        // Listen to friends' data
        const friendIds = data?.friends || [];
        friendIds.forEach(friendId => {
            const unsubFriend = onSnapshot(getUserDoc(friendId), (friendDoc) => {
                if(friendDoc.exists()){
                    setFriendsData(prev => ({ ...prev, [friendId]: friendDoc.data() }));
                }
            });
            // In a real app, you'd manage these unsubscribes carefully
        });
    });

    // Listen to map areas
    const unsubAreas = onSnapshot(getAreasCollection(), (snapshot) => {
      const newAreas = {};
      snapshot.forEach(doc => newAreas[doc.id] = { id: doc.id, ...doc.data() });
      setAreas(newAreas);
    });

    return () => {
      unsubUser();
      unsubAreas();
      // Unsubscribe from all friend listeners here
    };
  }, [currentUser]);

  // --- MOCK LOCATION UPDATE ---
  useEffect(() => {
    const locationInterval = setInterval(() => {
      if (currentUser && userData?.useGps) {
        const newLocation = { x: Math.random(), y: Math.random() };
        let newAreaName = 'The Wilds'; // Default area
        updateDoc(getUserDoc(currentUser.uid), { location: newLocation, currentArea: newAreaName });
      }
    }, 5000);
    return () => clearInterval(locationInterval);
  }, [currentUser, userData]);


  // --- HANDLERS ---
  const handlePasscodeSubmit = (passcode) => {
    if (passcode === '1979') {
      setModal({ name: 'locations' });
    } else {
      alert("Incorrect passcode.");
    }
  };

  const handleAddFriend = async (email) => {
    if (!email) return;
    try {
        const q = query(getPublicProfilesCollection(), where("email", "==", email.toLowerCase()));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            alert("User not found.");
            return;
        }
        const friendUid = querySnapshot.docs[0].id;
        if (friendUid && friendUid !== currentUser.uid) {
            await updateDoc(getUserDoc(currentUser.uid), { friends: arrayUnion(friendUid) });
            alert("Friend added!");
            setModal({ name: null });
        } else {
            alert("You can't add yourself!");
        }
    } catch (error) {
        alert(`Error adding friend: ${error.message}`);
    }
  };

  const handleCanvasClick = (pos) => {
      const firstPoint = currentPolygonPoints[0];
      const canvasWidth = 1200; // Assuming a base width for calculation
      const clickRadius = 10 / canvasWidth;

      if (currentPolygonPoints.length > 2 && Math.hypot(pos.x - firstPoint.x, pos.y - firstPoint.y) < clickRadius) {
          setModal({ name: 'areaName' });
      } else {
          setCurrentPolygonPoints(prev => [...prev, pos]);
      }
  };

  const saveArea = async (name) => {
      if (!name || currentPolygonPoints.length < 3) return;
      await addDoc(getAreasCollection(), { name, polygon: currentPolygonPoints });
      setCurrentPolygonPoints([]);
      setDevMode(false);
      setModal({ name: null });
  };
  
  const handleCheckIn = async (areaId) => {
      const area = areas[areaId];
      if (!area || !area.polygon) return;
      // Simple centroid calculation for marker placement
      const centroid = area.polygon.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
      centroid.x /= area.polygon.length;
      centroid.y /= area.polygon.length;
      await updateDoc(getUserDoc(currentUser.uid), { location: centroid, currentArea: area.name });
      setModal({ name: null });
  };
  
  // --- RENDER LOGIC ---
  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <h1 className="text-3xl font-bold text-gray-900">Herd Searcher</h1>
          <p className="text-gray-600 my-4">Please sign in to find your friends and see the map.</p>
          <button onClick={signIn} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition">
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // Logged-in view
  return (
    <>
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Herd Search</h1>
            <p className="text-gray-600">Stay connected with your crew at Beatherder festival.</p>
          </div>
          <button onClick={logOut} className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition">Sign Out</button>
        </header>

        <main>
            <div className="bg-white p-4 rounded-lg shadow-md mb-6 flex flex-wrap justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <img src={userData?.photoURL} alt="Your avatar" className="w-10 h-10 rounded-full"/>
                    <span className="font-semibold">{userData?.displayName}</span>
                    <button onClick={() => setModal({ name: 'settings' })} className="ml-2 text-gray-500 hover:text-gray-800"><i className="fas fa-cog fa-lg"></i></button>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setModal({ name: 'passcode' })} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition">Developer Mode</button>
                    <button onClick={() => setModal({ name: 'addFriend' })} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition">Add Friend</button>
                </div>
            </div>

            {isDevMode && (
                <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded-lg mb-6">
                    <h3 className="font-bold text-lg">Developer Mode: Drawing Area</h3>
                    <p>Click on the map to draw a polygon. Click the first point again to close the shape and name it.</p>
                    <button onClick={() => { setDevMode(false); setCurrentPolygonPoints([]); }} className="mt-2 bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded-lg text-sm">Cancel Drawing</button>
                </div>
            )}
            
            <Map 
              areas={areas} 
              isDevMode={isDevMode} 
              currentPolygonPoints={currentPolygonPoints}
              friendsData={friendsData}
              onCanvasClick={handleCanvasClick}
            />

            <div className="mt-8">
                <h2 className="text-2xl font-bold mb-4">Your Squad</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.values(friendsData).map(user => {
                        if (!user) return null;
                        const isYou = user.uid === currentUser.uid;
                        return (
                            <div key={user.uid} className={`bg-white p-4 rounded-lg shadow-md flex items-center gap-4 border-2 ${isYou ? 'border-blue-500' : 'border-transparent'}`}>
                                <img src={user.photoURL} alt={`${user.displayName}'s avatar`} className="w-12 h-12 rounded-full" />
                                <div>
                                    <p className="font-bold">{user.displayName} {isYou && '(You)'}</p>
                                    <p className="text-sm text-gray-600">Location: <span className="font-semibold text-indigo-600">{user.currentArea || 'Unknown'}</span></p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </main>
      </div>

      {!userData?.useGps && (
        <button onClick={() => setModal({ name: 'checkIn' })} className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-full shadow-lg transition z-40">
            <i className="fas fa-map-marker-alt mr-2"></i>Check In
        </button>
      )}

      {/* --- MODALS --- */}
      <Modal isOpen={modal.name === 'settings'} onClose={() => setModal({ name: null })}>
          <h3 className="text-xl font-bold mb-6">Settings</h3>
          <div className="flex items-center justify-between">
              <span className="text-gray-700">Use GPS Location</span>
              <label className="switch">
                  <input type="checkbox" checked={userData?.useGps ?? true} onChange={(e) => updateDoc(getUserDoc(currentUser.uid), { useGps: e.target.checked })} />
                  <span className="slider"></span>
              </label>
          </div>
          <p className="text-sm text-gray-500 mt-2">Turn off to manually check in to locations.</p>
      </Modal>

      <Modal isOpen={modal.name === 'passcode'} onClose={() => setModal({ name: null })}>
          <h3 className="text-lg font-bold mb-4">Enter Developer Passcode</h3>
          <form onSubmit={(e) => { e.preventDefault(); handlePasscodeSubmit(e.target.passcode.value); }}>
              <input type="password" name="passcode" className="w-full border border-gray-300 rounded-lg p-2 mb-4" />
              <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setModal({ name: null })} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg">Cancel</button>
                  <button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg">Submit</button>
              </div>
          </form>
      </Modal>

      <Modal isOpen={modal.name === 'addFriend'} onClose={() => setModal({ name: null })}>
          <h3 className="text-lg font-bold mb-4">Add a Friend</h3>
           <form onSubmit={(e) => { e.preventDefault(); handleAddFriend(e.target.email.value); }}>
              <input type="email" name="email" className="w-full border border-gray-300 rounded-lg p-2 mb-4" placeholder="friend@example.com" />
              <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setModal({ name: null })} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg">Cancel</button>
                  <button type="submit" className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">Add</button>
              </div>
          </form>
      </Modal>
      
      <Modal isOpen={modal.name === 'checkIn'} onClose={() => setModal({ name: null })}>
        <h3 className="text-xl font-bold mb-4">Check In To a Location</h3>
        <div className="max-h-80 overflow-y-auto border rounded-lg">
            {Object.values(areas).map(area => (
                <div key={area.id} onClick={() => handleCheckIn(area.id)} className="p-4 border-b last:border-b-0 hover:bg-gray-100 cursor-pointer">
                    {area.name}
                </div>
            ))}
        </div>
      </Modal>
      
      <Modal isOpen={modal.name === 'areaName'} onClose={() => { setModal({name: null}); setCurrentPolygonPoints([]); setDevMode(false); }}>
        <h3 className="text-lg font-bold mb-4">Name This Area</h3>
        <form onSubmit={(e) => { e.preventDefault(); saveArea(e.target.name.value); }}>
            <input type="text" name="name" className="w-full border border-gray-300 rounded-lg p-2 mb-4" placeholder="e.g., Main Stage" />
            <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setModal({name: null}); setCurrentPolygonPoints([]); setDevMode(false); }} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg">Cancel</button>
                <button type="submit" className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">Save</button>
            </div>
        </form>
      </Modal>
      
       <Modal isOpen={modal.name === 'locations'} onClose={() => setModal({ name: null })}>
          <h3 className="text-lg font-bold mb-4">Manage Locations</h3>
          <div className="max-h-64 overflow-y-auto mb-4 border rounded-lg p-2">
              {Object.values(areas).map(area => (
                  <div key={area.id} className="flex justify-between items-center p-2 border-b">
                      <span>{area.name}</span>
                      <button onClick={async () => { if(confirm(`Delete ${area.name}?`)) await deleteDoc(getAreaDoc(area.id))}} className="delete-area-btn bg-red-500 text-white text-xs py-1 px-2 rounded hover:bg-red-600">Delete</button>
                  </div>
              ))}
          </div>
          <div className="flex justify-between items-center">
              <button onClick={() => { setModal({ name: null }); setDevMode(true); }} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg">Add New Location</button>
          </div>
      </Modal>
    </>
  );
}