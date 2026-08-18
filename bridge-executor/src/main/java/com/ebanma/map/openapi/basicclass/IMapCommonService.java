package com.ebanma.map.openapi.basicclass;

import android.os.Binder;
import android.os.IBinder;
import android.os.IInterface;
import android.os.Parcel;
import android.os.RemoteException;

/**
 * BanmaMap MapExternalService COMMON 契约 (action com.ebanma.map.service.common)。
 * 手写 binder: 车上服务端事务码按 AIDL 声明顺序 (非字母序, 逆向自车上 dex 2026-08-17),
 * 标准 AIDL 编译器无法生成同序代码, 故手写并只实现本侧调用的方法:
 *   getNaviStatus=8, getMapServiceReadyState=27, changeDestinationForAI=48, confirmPreviewNavigation=55
 */
public interface IMapCommonService extends IInterface {

    byte getNaviStatus(String callerId) throws RemoteException;

    boolean getMapServiceReadyState(String callerId) throws RemoteException;

    void changeDestinationForAI(String callerId, Poi poi, IChangeDestinationCallback callback) throws RemoteException;

    void getSearchDataByKeyWords(String callerId, String keyword, IKeywordSearchCallback callback) throws RemoteException;

    int confirmPreviewNavigation(String callerId) throws RemoteException;

    void navigateToForAI(String callerId, RequestRouteInfoForAI info, boolean startNow, boolean simulation,
                         INavigateCallback callback) throws RemoteException;

    abstract class Stub extends Binder implements IMapCommonService {
        public static final String DESCRIPTOR = "com.ebanma.map.openapi.IMapCommonService";

        public Stub() { attachInterface(this, DESCRIPTOR); }

        public static IMapCommonService asInterface(IBinder obj) {
            if (obj == null) return null;
            IInterface iin = obj.queryLocalInterface(DESCRIPTOR);
            if (iin != null && iin instanceof IMapCommonService) return (IMapCommonService) iin;
            return new Proxy(obj);
        }

        @Override public IBinder asBinder() { return this; }

        @Override public boolean onTransact(int code, Parcel data, Parcel reply, int flags) throws RemoteException {
            switch (code) {
                case 8: { // getNaviStatus
                    data.enforceInterface(DESCRIPTOR);
                    String callerId = data.readString();
                    byte result = getNaviStatus(callerId);
                    reply.writeNoException();
                    reply.writeByte(result);
                    return true;
                }
                case 27: { // getMapServiceReadyState
                    data.enforceInterface(DESCRIPTOR);
                    String callerId = data.readString();
                    boolean result = getMapServiceReadyState(callerId);
                    reply.writeNoException();
                    reply.writeBoolean(result);
                    return true;
                }
                case 4: { // getSearchDataByKeyWords
                    data.enforceInterface(DESCRIPTOR);
                    String callerId = data.readString();
                    String keyword = data.readString();
                    IKeywordSearchCallback callback = IKeywordSearchCallback.Stub.asInterface(data.readStrongBinder());
                    getSearchDataByKeyWords(callerId, keyword, callback);
                    reply.writeNoException();
                    return true;
                }
                case 48: { // changeDestinationForAI
                    data.enforceInterface(DESCRIPTOR);
                    String callerId = data.readString();
                    Poi poi = data.readTypedObject(Poi.CREATOR);
                    IChangeDestinationCallback callback =
                            IChangeDestinationCallback.Stub.asInterface(data.readStrongBinder());
                    changeDestinationForAI(callerId, poi, callback);
                    reply.writeNoException();
                    return true;
                }
                case 49: { // navigateToForAI
                    data.enforceInterface(DESCRIPTOR);
                    String callerId = data.readString();
                    RequestRouteInfoForAI info = data.readTypedObject(RequestRouteInfoForAI.CREATOR);
                    boolean startNow = data.readBoolean();
                    boolean simulation = data.readBoolean();
                    INavigateCallback callback = INavigateCallback.Stub.asInterface(data.readStrongBinder());
                    navigateToForAI(callerId, info, startNow, simulation, callback);
                    reply.writeNoException();
                    return true;
                }
                case 55: { // confirmPreviewNavigation
                    data.enforceInterface(DESCRIPTOR);
                    String callerId = data.readString();
                    int result = confirmPreviewNavigation(callerId);
                    reply.writeNoException();
                    reply.writeInt(result);
                    return true;
                }
            }
            return super.onTransact(code, data, reply, flags);
        }

        private static class Proxy implements IMapCommonService {
            private final IBinder mRemote;
            Proxy(IBinder remote) { mRemote = remote; }
            @Override public IBinder asBinder() { return mRemote; }

            @Override public byte getNaviStatus(String callerId) throws RemoteException {
                Parcel data = Parcel.obtain(); Parcel reply = Parcel.obtain();
                try {
                    data.writeInterfaceToken(DESCRIPTOR);
                    data.writeString(callerId);
                    mRemote.transact(8, data, reply, 0);
                    reply.readException();
                    return reply.readByte();
                } finally { reply.recycle(); data.recycle(); }
            }

            @Override public boolean getMapServiceReadyState(String callerId) throws RemoteException {
                Parcel data = Parcel.obtain(); Parcel reply = Parcel.obtain();
                try {
                    data.writeInterfaceToken(DESCRIPTOR);
                    data.writeString(callerId);
                    mRemote.transact(27, data, reply, 0);
                    reply.readException();
                    return reply.readBoolean();
                } finally { reply.recycle(); data.recycle(); }
            }

            @Override public void getSearchDataByKeyWords(String callerId, String keyword, IKeywordSearchCallback callback) throws RemoteException {
                Parcel data = Parcel.obtain(); Parcel reply = Parcel.obtain();
                try {
                    data.writeInterfaceToken(DESCRIPTOR);
                    data.writeString(callerId);
                    data.writeString(keyword);
                    data.writeStrongInterface(callback);
                    mRemote.transact(4, data, reply, 0);
                    reply.readException();
                } finally { reply.recycle(); data.recycle(); }
            }

            @Override public void changeDestinationForAI(String callerId, Poi poi, IChangeDestinationCallback callback) throws RemoteException {
                Parcel data = Parcel.obtain(); Parcel reply = Parcel.obtain();
                try {
                    data.writeInterfaceToken(DESCRIPTOR);
                    data.writeString(callerId);
                    if (poi != null) { data.writeInt(1); poi.writeToParcel(data, 0); } else { data.writeInt(0); }
                    data.writeStrongInterface(callback);
                    mRemote.transact(48, data, reply, 0);
                    reply.readException();
                } finally { reply.recycle(); data.recycle(); }
            }

            @Override public void navigateToForAI(String callerId, RequestRouteInfoForAI info,
                                             boolean startNow, boolean simulation, INavigateCallback callback) throws RemoteException {
                Parcel data = Parcel.obtain(); Parcel reply = Parcel.obtain();
                try {
                    data.writeInterfaceToken(DESCRIPTOR);
                    data.writeString(callerId);
                    if (info != null) { data.writeInt(1); info.writeToParcel(data, 0); } else { data.writeInt(0); }
                    data.writeBoolean(startNow);
                    data.writeBoolean(simulation);
                    data.writeStrongInterface(callback);
                    mRemote.transact(49, data, reply, 0);
                    reply.readException();
                } finally { reply.recycle(); data.recycle(); }
            }

            @Override public int confirmPreviewNavigation(String callerId) throws RemoteException {
                Parcel data = Parcel.obtain(); Parcel reply = Parcel.obtain();
                try {
                    data.writeInterfaceToken(DESCRIPTOR);
                    data.writeString(callerId);
                    mRemote.transact(55, data, reply, 0);
                    reply.readException();
                    return reply.readInt();
                } finally { reply.recycle(); data.recycle(); }
            }
        }
    }
}
