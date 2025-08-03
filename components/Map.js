// components/Map.js
import { useEffect, useRef, memo } from 'react';
import Image from 'next/image';

const Map = ({ areas, isDevMode, currentPolygonPoints, friendsData, onCanvasClick }) => {
    const canvasRef = useRef(null);
    const imageRef = useRef(null);

    const redrawAll = () => {
        const canvas = canvasRef.current;
        const image = imageRef.current;
        const ctx = canvas?.getContext('2d');

        if (!canvas || !image || !ctx) return;

        canvas.width = image.clientWidth;
        canvas.height = image.clientHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw saved areas
        for (const areaId in areas) {
            const area = areas[areaId];
            if (area && area.polygon) {
                drawPolygon(ctx, area.polygon, 'rgba(29, 78, 216, 0.3)', 'rgba(29, 78, 216, 0.7)');
            }
        }

        // Draw current polygon in dev mode
        if (isDevMode && currentPolygonPoints.length > 0) {
            drawPolygon(ctx, currentPolygonPoints, 'rgba(255, 255, 0, 0.3)', 'rgba(255, 255, 0, 0.7)');
        }
    };
    
    const drawPolygon = (ctx, points, color, strokeColor) => {
        if (!points || points.length < 1) return;
        const canvas = canvasRef.current;
        ctx.fillStyle = color;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(points[0].x * canvas.width, points[0].y * canvas.height);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x * canvas.width, points[i].y * canvas.height);
        }
        if (points.length > 2) {
            ctx.closePath();
            ctx.fill();
        }
        ctx.stroke();
        ctx.fillStyle = 'yellow';
        points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, 2 * Math.PI);
            ctx.fill();
        });
    };

    useEffect(() => {
        redrawAll();
        window.addEventListener('resize', redrawAll);
        return () => window.removeEventListener('resize', redrawAll);
    }, [areas, isDevMode, currentPolygonPoints, friendsData]);

    const handleMapClick = (evt) => {
        if (!isDevMode || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const pos = { x: (evt.clientX - rect.left) / rect.width, y: (evt.clientY - rect.top) / rect.height };
        onCanvasClick(pos);
    };

    return (
        <div id="map-container" className="relative w-full max-w-[1200px] mx-auto overflow-hidden rounded-lg shadow-lg">
             <Image
                ref={imageRef}
                id="map-image"
                src="https://i.ibb.co/3yk31BFr/Beatherder-Map.png"
                alt="Beat-Herder Festival Map"
                width={1200}
                height={800}
                className="block w-full h-auto bg-gray-200"
                priority
                onLoad={redrawAll}
            />
            <canvas id="map-canvas" ref={canvasRef} onClick={handleMapClick}></canvas>
            <div id="user-markers-container">
                {Object.values(friendsData).map(user => {
                    if (!user || !user.location) return null;
                    const displayName = user.displayName || 'User';
                    const photoURL = user.photoURL || `https://placehold.co/40x40/E0E0E0/757575?text=${displayName.charAt(0)}`;
                    return (
                        <div
                            key={user.uid}
                            className="user-marker"
                            style={{ left: `${user.location.x * 100}%`, top: `${user.location.y * 100}%` }}
                        >
                            <img src={photoURL} alt={`${displayName}'s avatar`} />
                            <div className="name-label">{displayName.split(' ')[0]}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default memo(Map);