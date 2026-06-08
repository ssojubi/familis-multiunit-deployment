from fastapi import APIRouter, HTTPException
from ..services.database import get_db_connection
from datetime import datetime

router = APIRouter()

@router.get("/summary")
async def dashboard_summary():
    """Get overall dashboard statistics from both frame_logs and emotion_results"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Total sessions
        cursor.execute("SELECT COUNT(*) as total FROM sessions")
        total_sessions = cursor.fetchone()["total"]
        
        # Active sessions
        cursor.execute("SELECT COUNT(*) as active FROM sessions WHERE status = 'active'")
        active_sessions = cursor.fetchone()["active"]
        
        # Total kiosks
        cursor.execute("SELECT COUNT(*) as total FROM kiosk")
        total_kiosks = cursor.fetchone()["total"]
        
        # Total participants
        cursor.execute("SELECT COUNT(*) as total FROM participants")
        total_participants = cursor.fetchone()["total"]
        
        # Average hedonic score from frame_logs (kiosk-local FER)
        cursor.execute("SELECT AVG(hedonic_score) as avg_hedonic FROM frame_logs WHERE hedonic_score IS NOT NULL")
        avg_hedonic_local = cursor.fetchone()["avg_hedonic"] or 0
        
        # Average hedonic score from emotion_results (central FER)
        cursor.execute("SELECT AVG(hedonic_score) as avg_hedonic FROM emotion_results WHERE hedonic_score IS NOT NULL")
        avg_hedonic_central = cursor.fetchone()["avg_hedonic"] or 0
        
        # Average confidence from emotion_results
        cursor.execute("SELECT AVG(confidence) as avg_confidence FROM emotion_results WHERE confidence IS NOT NULL")
        avg_confidence = cursor.fetchone()["avg_confidence"] or 0
        
        # Sentiment distribution from emotion_results
        cursor.execute("""
            SELECT sentiment, COUNT(*) as count 
            FROM emotion_results 
            WHERE sentiment IS NOT NULL 
            GROUP BY sentiment
        """)
        sentiment_counts = cursor.fetchall()
        
        return {
            "ok": True,
            "total_sessions": total_sessions,
            "active_sessions": active_sessions,
            "total_kiosks": total_kiosks,
            "total_participants": total_participants,
            "avg_hedonic_local": round(float(avg_hedonic_local), 3),
            "avg_hedonic_central": round(float(avg_hedonic_central), 3),
            "avg_confidence": round(float(avg_confidence), 3),
            "sentiment_distribution": sentiment_counts
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@router.get("/kiosks")
async def list_all_kiosks():
    """Get all kiosks with their stats"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute("""
            SELECT k.kiosk_id, k.name, k.location, k.image_url, k.created_at,
                   COUNT(DISTINCT s.session_id) as total_sessions,
                   COUNT(DISTINCT s.participant_id) as unique_participants,
                   AVG(fl.hedonic_score) as avg_hedonic
            FROM kiosk k
            LEFT JOIN sessions s ON s.kiosk_id = k.kiosk_id
            LEFT JOIN frame_logs fl ON fl.session_id = s.session_id
            GROUP BY k.kiosk_id, k.name, k.location, k.image_url, k.created_at
            ORDER BY k.created_at DESC
        """)
        kiosks = cursor.fetchall()
        
        # Convert Decimal to float for JSON serialization
        for k in kiosks:
            if k.get("avg_hedonic"):
                k["avg_hedonic"] = float(k["avg_hedonic"])
        
        return {"ok": True, "kiosks": kiosks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@router.get("/kiosks/{kiosk_id}")
async def kiosk_detail(kiosk_id: int):
    """Get detailed statistics for a specific kiosk"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Kiosk info
        cursor.execute("SELECT * FROM kiosk WHERE kiosk_id = %s", (kiosk_id,))
        kiosk = cursor.fetchone()
        if not kiosk:
            raise HTTPException(status_code=404, detail="Kiosk not found")
        
        # Sessions from this kiosk
        cursor.execute("""
            SELECT s.session_id, s.status, s.start_time, s.end_time,
                   fp.name as food_name, p.name as participant_name,
                   COUNT(fl.frame_log_id) as frame_count
            FROM sessions s
            LEFT JOIN food_products fp ON fp.food_id = s.food_id
            LEFT JOIN participants p ON p.participant_id = s.participant_id
            LEFT JOIN frame_logs fl ON fl.session_id = s.session_id
            WHERE s.kiosk_id = %s
            GROUP BY s.session_id
            ORDER BY s.created_at DESC
            LIMIT 50
        """, (kiosk_id,))
        sessions = cursor.fetchall()
        
        # Emotion results from this kiosk (via sessions)
        cursor.execute("""
            SELECT er.sentiment, COUNT(*) as count
            FROM emotion_results er
            INNER JOIN sessions s ON s.session_id = er.session_id
            WHERE s.kiosk_id = %s
            GROUP BY er.sentiment
        """, (kiosk_id,))
        sentiment_dist = cursor.fetchall()
        
        return {
            "ok": True,
            "kiosk": kiosk,
            "sessions": sessions,
            "sentiment_distribution": sentiment_dist
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@router.get("/foods")
async def list_foods_with_analytics():
    """Get all food products with analytics"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute("""
            SELECT fp.food_id, fp.name, fp.category, fp.image_url, fp.created_at,
                   COUNT(DISTINCT s.session_id) as total_sessions,
                   AVG(fl.hedonic_score) as avg_hedonic,
                   AVG(fl.confidence_score) as avg_confidence
            FROM food_products fp
            LEFT JOIN sessions s ON s.food_id = fp.food_id
            LEFT JOIN frame_logs fl ON fl.session_id = s.session_id
            GROUP BY fp.food_id
            ORDER BY fp.created_at DESC
        """)
        foods = cursor.fetchall()
        
        for f in foods:
            if f.get("avg_hedonic"):
                f["avg_hedonic"] = float(f["avg_hedonic"])
            if f.get("avg_confidence"):
                f["avg_confidence"] = float(f["avg_confidence"])
        
        return {"ok": True, "foods": foods}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@router.get("/foods/{food_id}")
async def food_analytics(food_id: int):
    """Get detailed analytics for a specific food product"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Food info
        cursor.execute("SELECT * FROM food_products WHERE food_id = %s", (food_id,))
        food = cursor.fetchone()
        if not food:
            raise HTTPException(status_code=404, detail="Food not found")
        
        # Session stats
        cursor.execute("""
            SELECT 
                COUNT(*) as total_sessions,
                AVG(TIMESTAMPDIFF(SECOND, start_time, end_time)) as avg_duration_sec
            FROM sessions
            WHERE food_id = %s AND status = 'completed'
        """, (food_id,))
        session_stats = cursor.fetchone()
        
        # Hedonic score distribution from frame_logs
        cursor.execute("""
            SELECT 
                CASE 
                    WHEN (fl.hedonic_score * 8 + 1) >= 7 THEN 'Positive'
                    WHEN (fl.hedonic_score * 8 + 1) >= 4 THEN 'Neutral'
                    ELSE 'Negative'
                END as sentiment,
                COUNT(*) as count
            FROM frame_logs fl
            INNER JOIN sessions s ON s.session_id = fl.session_id
            WHERE s.food_id = %s AND fl.hedonic_score IS NOT NULL
            GROUP BY sentiment
        """, (food_id,))
        sentiment_dist = cursor.fetchall()
        
        # Timeline (first, middle, last thirds of sessions)
        cursor.execute("""
            SELECT fl.hedonic_score, fl.timestamp
            FROM frame_logs fl
            INNER JOIN sessions s ON s.session_id = fl.session_id
            WHERE s.food_id = %s AND fl.hedonic_score IS NOT NULL
            ORDER BY fl.timestamp
        """, (food_id,))
        all_scores = cursor.fetchall()
        
        total = len(all_scores)
        timeline = {
            "early": 0,
            "mid": 0,
            "late": 0
        }
        if total > 0:
            early = [float(s["hedonic_score"]) for s in all_scores[:total//3]]
            mid = [float(s["hedonic_score"]) for s in all_scores[total//3:2*total//3]]
            late = [float(s["hedonic_score"]) for s in all_scores[2*total//3:]]
            timeline = {
                "early": round(sum(early) / len(early), 3) if early else 0,
                "mid": round(sum(mid) / len(mid), 3) if mid else 0,
                "late": round(sum(late) / len(late), 3) if late else 0
            }
        
        # Survey results (if available)
        cursor.execute("""
            SELECT 
                AVG(color_rating) as color,
                AVG(flavor_aroma_rating) as flavor,
                AVG(salt_sweet_rating) as salt_sweet,
                AVG(texture_rating) as texture,
                AVG(final_overall_rating) as overall
            FROM survey_results sr
            INNER JOIN sessions s ON s.session_id = sr.session_id
            WHERE s.food_id = %s
        """, (food_id,))
        survey = cursor.fetchone()
        
        return {
            "ok": True,
            "food": food,
            "total_sessions": session_stats.get("total_sessions", 0),
            "avg_duration_sec": session_stats.get("avg_duration_sec", 0),
            "sentiment_distribution": sentiment_dist,
            "timeline": timeline,
            "survey_averages": {
                "color": round(float(survey["color"]), 2) if survey.get("color") else 0,
                "flavor": round(float(survey["flavor"]), 2) if survey.get("flavor") else 0,
                "salt_sweet": round(float(survey["salt_sweet"]), 2) if survey.get("salt_sweet") else 0,
                "texture": round(float(survey["texture"]), 2) if survey.get("texture") else 0,
                "overall": round(float(survey["overall"]), 2) if survey.get("overall") else 0
            } if survey else None
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@router.get("/sessions/{session_id}")
async def get_session_analytics(session_id: int):
    """Get detailed analytics for a specific session"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Session info
        cursor.execute("""
            SELECT s.*, fp.name as food_name, p.name as participant_name, k.name as kiosk_name
            FROM sessions s
            LEFT JOIN food_products fp ON fp.food_id = s.food_id
            LEFT JOIN participants p ON p.participant_id = s.participant_id
            LEFT JOIN kiosk k ON k.kiosk_id = s.kiosk_id
            WHERE s.session_id = %s
        """, (session_id,))
        session = cursor.fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Frame logs (FER results from kiosk)
        cursor.execute("""
            SELECT frame_log_id, timestamp, face_detected, confidence_score, hedonic_score, frame_image_url
            FROM frame_logs
            WHERE session_id = %s
            ORDER BY timestamp ASC
        """, (session_id,))
        frames = cursor.fetchall()
        
        # Central emotion results (if any)
        cursor.execute("""
            SELECT frame_id, hedonic_score, confidence, valence, sentiment, processed_at
            FROM emotion_results
            WHERE session_id = %s
            ORDER BY processed_at ASC
        """, (str(session_id),))
        central_results = cursor.fetchall()
        
        # Survey results
        cursor.execute("""
            SELECT color_rating, flavor_aroma_rating, salt_sweet_rating, texture_rating, final_overall_rating, remarks
            FROM survey_results
            WHERE session_id = %s
        """, (session_id,))
        survey = cursor.fetchone()
        
        # Calculate stats
        hedonic_scores = [f["hedonic_score"] for f in frames if f["hedonic_score"] is not None]
        
        return {
            "ok": True,
            "session": session,
            "frame_count": len(frames),
            "avg_hedonic": round(sum(hedonic_scores) / len(hedonic_scores), 4) if hedonic_scores else None,
            "face_detection_rate": round(len([f for f in frames if f["face_detected"]]) / len(frames), 4) if frames else None,
            "frames": frames[:100],  # Limit to 100 for performance
            "central_results": central_results,
            "survey_results": survey
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@router.get("/participants")
async def list_participants():
    """Get all participants with their session stats"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute("""
            SELECT p.*, 
                   COUNT(s.session_id) as total_sessions,
                   AVG(fl.hedonic_score) as avg_hedonic
            FROM participants p
            LEFT JOIN sessions s ON s.participant_id = p.participant_id
            LEFT JOIN frame_logs fl ON fl.session_id = s.session_id
            GROUP BY p.participant_id
            ORDER BY p.created_at DESC
        """)
        participants = cursor.fetchall()
        
        for p in participants:
            if p.get("avg_hedonic"):
                p["avg_hedonic"] = float(p["avg_hedonic"])
        
        return {"ok": True, "participants": participants}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()