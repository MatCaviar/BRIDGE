package com.ebanma.map.openapi.basicclass;

import android.os.Parcel;
import android.os.Parcelable;

/**
 * basicclass.Poi — AIDL typed-parcelable (逆向自车上 BanmaMap dex 2026-08-17):
 * writeToParcel 带 size 前缀块 (AIDL 生成器格式), 配合 _Parcel.writeTypedObject 的 writeInt(1) 标记。
 */
public class Poi implements Parcelable {
    public String id;
    public String name;
    public double lon;
    public double lat;
    public String address;
    public String category;
    public String typeCode;
    public String cityName;
    public String adCode;
    public String cityCode;
    public String district;
    public String pic;
    public String distance;
    public long update_time;

    public Poi() {}

    @Override public int describeContents() { return 0; }

    @Override public void writeToParcel(Parcel dest, int flags) {
        int start = dest.dataPosition();
        dest.writeInt(0); // size placeholder, patched below (AIDL typed-parcelable format)
        dest.writeString(id);
        dest.writeString(name);
        dest.writeDouble(lon);
        dest.writeDouble(lat);
        dest.writeString(address);
        dest.writeString(category);
        dest.writeString(typeCode);
        dest.writeString(cityName);
        dest.writeString(adCode);
        dest.writeString(cityCode);
        dest.writeString(district);
        dest.writeString(pic);
        dest.writeString(distance);
        dest.writeLong(update_time);
        int end = dest.dataPosition();
        dest.setDataPosition(start);
        dest.writeInt(end - start);
        dest.setDataPosition(end);
    }

    public void readFromParcel(Parcel in) {
        int size = in.readInt();
        if (size == 0) return;
        id = in.readString();
        name = in.readString();
        lon = in.readDouble();
        lat = in.readDouble();
        address = in.readString();
        category = in.readString();
        typeCode = in.readString();
        cityName = in.readString();
        adCode = in.readString();
        cityCode = in.readString();
        district = in.readString();
        pic = in.readString();
        distance = in.readString();
        update_time = in.readLong();
    }

    public static final Creator<Poi> CREATOR = new Creator<Poi>() {
        @Override public Poi createFromParcel(Parcel in) { Poi p = new Poi(); p.readFromParcel(in); return p; }
        @Override public Poi[] newArray(int size) { return new Poi[size]; }
    };
}
