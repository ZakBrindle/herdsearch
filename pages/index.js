// pages/index.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc, onSnapshot, collection, addDoc, query, where, getDocs, updateDoc, arrayUnion, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import Map from '../components/Map';
import Modal from '../components/Modal';

// --- (Your Firestore constants remain the same) ---
const APP_ID = 'festival-friend-finder';
const getAreasCollection = () => collection(db, `artifacts/${APP_ID}/public/data/areas`);
const getAreaDoc = (id) => doc(db, `artifacts/${APP_ID}/public/data/areas`, id);
const getUserDoc = (uid) => doc(db, `artifacts/${APP_ID}/users/${uid}/profile`, 'data');
const getPublicProfilesCollection = () => collection(db, `artifacts/${APP_ID}/public/data/user_profiles`);

// --- (Icon components for a cleaner look) ---
const SettingsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106A1.532 1.532 0 0111.49 3.17zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>;
const CheckInIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>;
const DevIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 01-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>;

export default function HomePage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [isDevMode, setDevMode] = useState(false);
  const [currentPolygonPoints, setCurrentPolygonPoints] = useState([]);
  const [areas, setAreas] = useState({});
  const [friendsData, setFriendsData] = useState({});
  const [activeModal, setActiveModal] = useState(null);
  const [confirmProps, setConfirmProps] = useState({ isOpen: false, message: '', onConfirm: () => {} });

  const openModal = (modalName) => setActiveModal(modalName);
  const closeModal = () => setActiveModal(null);
  
  // --- (Your logic functions like setupUser, handlePasscodeSubmit, handleAddFriend, etc., remain the same) ---
  const setupUser = useCallback(async (user) => {
    const userRef = getUserDoc(user.uid);
    const publicProfileRef = doc(getPublicProfilesCollection(), user.uid);
    const userDocSnap = await getDoc(userRef);
    if (!userDocSnap.exists()) {
      const profileData = {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email ? user.email.toLowerCase() : null,
        photoURL: user.photoURL,
      };
      await setDoc(userRef, { ...profileData, friends: [], location: null, currentArea: 'unknown', useGps: true });
      await setDoc(publicProfileRef, profileData);
    }
  }, []);
  
  const showAlert = (message) => {
    alert(message); // Using native alert for simplicity, but a custom modal could be used
  };

  const showConfirm = (message, onConfirm) => {
    setConfirmProps({ isOpen: true, message, onConfirm });
  };

  const handleConfirm = () => {
    if (confirmProps.onConfirm) {
      confirmProps.onConfirm();
    }
    setConfirmProps({ isOpen: false, message: '', onConfirm: () => {} });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        await setupUser(user);
      } else {
        setCurrentUser(null);
        setUserData(null);
        setFriendsData({});
        setDevMode(false);
      }
    });
    return () => unsubscribe();
  }, [setupUser]);

  useEffect(() => {
    if (!currentUser) return;
    const unsubUser = onSnapshot(getUserDoc(currentUser.uid), (doc) => {
        const data = doc.data();
        setUserData(data);
        setFriendsData(prev => ({ ...prev, [currentUser.uid]: data }));

        const friendIds = data?.friends || [];
        const currentFriendIds = Object.keys(friendsData).filter(id => id !== currentUser.uid);

        friendIds.forEach(friendId => {
            if (!currentFriendIds.includes(friendId)) {
                onSnapshot(getUserDoc(friendId), (friendDoc) => {
                    if (friendDoc.exists()){
                         setFriendsData(prev => ({ ...prev, [friendId]: friendDoc.data() }));
                    }
                });
            }
        });
    });

    const unsubAreas = onSnapshot(getAreasCollection(), (snapshot) => {
      const newAreas = {};
      snapshot.forEach(doc => newAreas[doc.id] = { id: doc.id, ...doc.data() });
      setAreas(newAreas);
    });

    return () => { unsubUser(); unsubAreas(); };
  }, [currentUser, friendsData]);

    const handlePasscodeSubmit = (passcode) => {
        if (passcode === '1979') {
            closeModal();
            openModal('locations');
        } else {
            showAlert("Incorrect passcode.");
        }
    };

    const handleAddFriend = async (email) => {
        if (!email) return;
        try {
            const q = query(getPublicProfilesCollection(), where("email", "==", email.toLowerCase()));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
                showAlert("User not found. Please ensure they have signed in at least once.");
                return;
            }
            const friendUid = querySnapshot.docs[0].id;
            if (friendUid && friendUid !== currentUser.uid) {
                await updateDoc(getUserDoc(currentUser.uid), { friends: arrayUnion(friendUid) });
                showAlert("Friend added!");
                closeModal();
            } else {
                showAlert("You can't add yourself!");
            }
        } catch (error) {
            showAlert(`Error adding friend: ${error.message}`);
        }
    };

    const handleCanvasClick = useCallback((pos) => {
        const firstPoint = currentPolygonPoints[0];
        const canvasWidth = 1200;
        const clickRadius = 10 / canvasWidth;

        if (currentPolygonPoints.length > 2 && Math.hypot(pos.x - firstPoint.x, pos.y - firstPoint.y) < clickRadius) {
            openModal('areaName');
        } else {
            setCurrentPolygonPoints(prev => [...prev, pos]);
        }
    }, [currentPolygonPoints]);

    const saveArea = async (name) => {
        if (!name || currentPolygonPoints.length < 3) return;
        await addDoc(getAreasCollection(), { name, polygon: currentPolygonPoints });
        setCurrentPolygonPoints([]);
        setDevMode(false);
        closeModal();
    };
    
    const deleteArea = async (areaId) => {
        const areaName = areas[areaId]?.name || 'the selected area';
        showConfirm(`Are you sure you want to delete "${areaName}"?`, async () => {
            try {
                await deleteDoc(getAreaDoc(areaId));
            } catch (error) {
                showAlert("Could not delete the area.");
            }
        });
    };

    const handleCheckIn = async (areaId) => {
        const area = areas[areaId];
        if (!area || !area.polygon) return;
        const centroid = area.polygon.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
        centroid.x /= area.polygon.length;
        centroid.y /= area.polygon.length;
        await updateDoc(getUserDoc(currentUser.uid), { location: centroid, currentArea: area.name });
        closeModal();
    };

    const sortedSquad = useMemo(() => {
        return Object.values(friendsData).sort((a, b) => {
            if (!a || !b) return 0;
            if (a.uid === currentUser?.uid) return -1;
            if (b.uid === currentUser?.uid) return 1;
            return (a.displayName || '').localeCompare(b.displayName || '');
        });
    }, [friendsData, currentUser]);
  
  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-100 p-4">
        <div className="text-center p-8 sm:p-12 bg-white rounded-2xl shadow-card max-w-md w-full">
          <h1 className="text-4xl font-bold text-neutral-800">Herd Search</h1>
          <p className="text-neutral-500 my-5 text-lg">Sign in to find your crew.</p>
          <button 
            onClick={() => signInWithPopup(auth, new GoogleAuthProvider())} 
            className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 px-4 rounded-xl transition-all duration-200 shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40">
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-4xl font-bold text-neutral-800">Herd Search</h1>
            <p className="text-neutral-500">Stay connected with your crew at the festival.</p>
          </div>
          <button onClick={() => signOut(auth)} className="bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-bold py-2 px-4 rounded-lg transition-colors duration-200">Sign Out</button>
        </header>

        <main>
            <div className="bg-white p-4 rounded-2xl shadow-card mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <img src={userData?.photoURL} alt="Your avatar" className="w-12 h-12 rounded-full"/>
                    <div>
                        <span className="font-bold text-lg text-neutral-800">{userData?.displayName}</span>
                        <p className="text-sm text-neutral-500">Welcome back!</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => openModal('settings')} className="p-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-full transition-colors duration-200"><SettingsIcon /></button>
                    <button onClick={() => openModal('passcode')} className="bg-neutral-800 hover:bg-neutral-900 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center gap-2">
                        <DevIcon /> Developer
                    </button>
                    <button onClick={() => openModal('addFriend')} className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">Add Friend</button>
                </div>
            </div>

            {isDevMode && (
                <div className="bg-primary-light border-l-4 border-primary text-primary-dark p-4 rounded-lg mb-6">
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

            <div className="mt-12">
                <h2 className="text-3xl font-bold mb-6 text-neutral-800">Your Squad</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedSquad.map(user => {
                        if (!user) return null;
                        const isYou = user.uid === currentUser.uid;
                        return (
                            <div key={user.uid} className={`bg-white p-5 rounded-2xl shadow-card transition-shadow duration-300 hover:shadow-card-hover flex items-center gap-4 border-2 ${isYou ? 'border-primary' : 'border-transparent'}`}>
                                <img src={user.photoURL} alt={`${user.displayName}'s avatar`} className="w-14 h-14 rounded-full" />
                                <div className="overflow-hidden">
                                    <p className="font-bold text-lg truncate">{user.displayName} {isYou && <span className="text-sm font-medium text-primary">(You)</span>}</p>
                                    <p className="text-sm text-neutral-500">Location: <span className="font-semibold text-primary">{user.currentArea || 'Unknown'}</span></p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </main>
      </div>

      {!(userData?.useGps) && (
        <button onClick={() => openModal('checkIn')} className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-primary hover:bg-primary-hover text-white font-bold py-3 px-6 rounded-full shadow-lg transition z-40 flex items-center gap-2">
            <CheckInIcon /> Check In
        </button>
      )}

      {/* --- MODALS --- */}
      <Modal isOpen={activeModal !== null} onClose={closeModal}>
        {/* Settings Modal */}
        {activeModal === 'settings' && (
            <>
                <h3 className="text-xl font-bold mb-6 text-neutral-800">Settings</h3>
                <div className="bg-neutral-100 p-4 rounded-lg flex items-center justify-between">
                    <label htmlFor="gps-toggle" className="text-neutral-700 font-medium">Use GPS Location</label>
                    <div className="relative inline-block w-12 align-middle select-none transition duration-200 ease-in">
                        <input type="checkbox" id="gps-toggle" checked={userData?.useGps ?? true} onChange={(e) => updateDoc(getUserDoc(currentUser.uid), { useGps: e.target.checked })} 
                               className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer peer"/>
                        <label htmlFor="gps-toggle" className="toggle-label block overflow-hidden h-6 rounded-full bg-neutral-300 cursor-pointer peer-checked:bg-primary"></label>
                    </div>
                </div>
                <p className="text-sm text-neutral-500 mt-3">Turn this off to manually check in to predefined locations.</p>
                <div className="flex justify-end mt-8">
                    <button onClick={closeModal} className="bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-bold py-2 px-5 rounded-lg transition">Close</button>
                </div>
            </>
        )}
        
        {/* All other modals use a similar, cleaner structure */}
        {['passcode', 'addFriend', 'areaName'].includes(activeModal) && (
             <form onSubmit={(e) => {
                e.preventDefault();
                if (activeModal === 'passcode') handlePasscodeSubmit(e.target.passcode.value);
                if (activeModal === 'addFriend') handleAddFriend(e.target.email.value);
                if (activeModal === 'areaName') saveArea(e.target.name.value);
             }}>
                <h3 className="text-xl font-bold mb-4 text-neutral-800">
                    {activeModal === 'passcode' && 'Enter Developer Passcode'}
                    {activeModal === 'addFriend' && 'Add a Friend'}
                    {activeModal === 'areaName' && 'Name This Area'}
                </h3>
                <input 
                    type={activeModal === 'passcode' ? 'password' : activeModal === 'addFriend' ? 'email' : 'text'}
                    name={activeModal === 'passcode' ? 'passcode' : activeModal === 'addFriend' ? 'email' : 'name'}
                    className="w-full border-neutral-300 rounded-lg p-3 mb-6 focus:ring-2 focus:ring-primary focus:border-primary transition" 
                    placeholder={
                      activeModal === 'addFriend' ? 'friend@example.com' :
                      activeModal === 'areaName' ? 'e.g., Main Stage' : ''
                    }
                    autoFocus
                />
                <div className="flex justify-end gap-3">
                    <button type="button" onClick={activeModal === 'areaName' ? () => { closeModal(); setCurrentPolygonPoints([]); setDevMode(false); } : closeModal} className="bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-bold py-2 px-5 rounded-lg transition">Cancel</button>
                    <button type="submit" className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-5 rounded-lg transition">Submit</button>
                </div>
             </form>
        )}
        
        {/* Check-in Modal */}
        {activeModal === 'checkIn' && (
             <>
                <h3 className="text-xl font-bold mb-4 text-neutral-800">Check In To a Location</h3>
                <div className="max-h-80 overflow-y-auto -mx-6">
                    {Object.values(areas).map(area => (
                        <div key={area.id} onClick={() => handleCheckIn(area.id)} className="px-6 py-4 border-b border-neutral-200 last:border-b-0 hover:bg-primary/10 cursor-pointer transition">
                            <span className="font-medium text-neutral-700">{area.name}</span>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end mt-6 -mb-2">
                    <button onClick={closeModal} className="bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-bold py-2 px-5 rounded-lg transition">Cancel</button>
                </div>
             </>
        )}

        {/* Manage Locations Modal */}
        {activeModal === 'locations' && (
             <>
                <h3 className="text-xl font-bold mb-4 text-neutral-800">Manage Locations</h3>
                <div className="max-h-72 overflow-y-auto mb-6 border border-neutral-200 rounded-lg">
                    {Object.values(areas).length > 0 ? Object.values(areas).map(area => (
                        <div key={area.id} className="flex justify-between items-center p-3 border-b border-neutral-200 last:border-b-0">
                            <span className="text-neutral-700">{area.name}</span>
                            <button onClick={() => deleteArea(area.id)} className="text-red-500 hover:text-red-700 text-sm font-semibold py-1 px-2 rounded hover:bg-red-100 transition">Delete</button>
                        </div>
                    )) : <p className="p-4 text-center text-neutral-500">No locations added yet.</p>}
                </div>
                <div className="flex justify-between items-center">
                    <button onClick={() => { closeModal(); setDevMode(true); }} className="bg-secondary hover:bg-secondary-hover text-white font-bold py-2 px-4 rounded-lg transition">Add New Location</button>
                    <button onClick={closeModal} className="bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-bold py-2 px-5 rounded-lg transition">Close</button>
                </div>
            </>
        )}

        {/* Confirmation Modal */}
        {confirmProps.isOpen && (
            <div className="text-center p-4">
                <h3 className="text-xl font-bold mb-2 text-neutral-800">Are you sure?</h3>
                <p className="mb-6 text-neutral-600">{confirmProps.message}</p>
                <div className="flex justify-center gap-4">
                    <button onClick={() => setConfirmProps({ ...confirmProps, isOpen: false })} className="bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-bold py-2 px-6 rounded-lg transition">Cancel</button>
                    <button onClick={handleConfirm} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition">Confirm</button>
                </div>
            </div>
        )}

      </Modal>
      {/* A small style block for the new toggle switch */}
      <style jsx global>{`
        .toggle-checkbox:checked { right: 0; border-color: #4f46e5; }
        .toggle-checkbox:checked + .toggle-label { background-color: #4f46e5; }
      `}</style>
    </>
  );
}