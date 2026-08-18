package com.ebanma.map.openapi.basicclass;

import android.os.Parcel;
import android.os.Parcelable;

/** RequestRouteInfoForAI — typed-parcelable (逆向 2026-08-17): destPos, startPos, destName, wayPoints, routeStrategy。
 *  startPos 可为 null → 地图端回退到车辆当前位置。 */
public class RequestRouteInfoForAI implements Parcelable {
    public Poi destPos;
    public Poi startPos;
    public String destName;
    public Poi[] wayPoints;
    public byte routeStrategy;

    public RequestRouteInfoForAI() {}

    @Override public int describeContents() { return 0; }

    @Override public void writeToParcel(Parcel dest, int flags) {
        int start = dest.dataPosition();
        dest.writeInt(0); // size placeholder (AIDL typed-parcelable)
        if (destPos != null) { dest.writeInt(1); destPos.writeToParcel(dest, flags); } else { dest.writeInt(0); }
        if (startPos != null) { dest.writeInt(1); startPos.writeToParcel(dest, flags); } else { dest.writeInt(0); }
        dest.writeString(destName);
        if (wayPoints != null) {
            dest.writeInt(wayPoints.length);
            for (Poi p : wayPoints) {
                if (p != null) { dest.writeInt(1); p.writeToParcel(dest, flags); } else { dest.writeInt(0); }
            }
        } else {
            dest.writeInt(-1);
        }
        dest.writeByte(routeStrategy);
        int end = dest.dataPosition();
        dest.setDataPosition(start);
        dest.writeInt(end - start);
        dest.setDataPosition(end);
    }

    public void readFromParcel(Parcel in) {
        int size = in.readInt();
        if (size == 0) return;
        if (in.readInt() != 0) { destPos = new Poi(); destPos.readFromParcel(in); }
        if (in.readInt() != 0) { startPos = new Poi(); startPos.readFromParcel(in); }
        destName = in.readString();
        int n = in.readInt();
        if (n >= 0) {
            wayPoints = new Poi[n];
            for (int i = 0; i < n; i++) {
                if (in.readInt() != 0) { wayPoints[i] = new Poi(); wayPoints[i].readFromParcel(in); }
            }
        }
        routeStrategy = in.readByte();
    }

    public static final Creator<RequestRouteInfoForAI> CREATOR = new Creator<RequestRouteInfoForAI>() {
        @Override public RequestRouteInfoForAI createFromParcel(Parcel in) { RequestRouteInfoForAI o = new RequestRouteInfoForAI(); o.readFromParcel(in); return o; }
        @Override public RequestRouteInfoForAI[] newArray(int size) { return new RequestRouteInfoForAI[size]; }
    };
}
